import type { ConnectionMode } from "@query-guardian/core";

/**
 * Batching HTTP client for the API's ingest endpoint.
 *
 * - Stats snapshots flush immediately on every poll cycle (piggybacking any
 *   queued slow-query events).
 * - Log-tail events buffer and flush when the queue reaches `eventFlushSize`
 *   or after `eventFlushDelayMs`, whichever comes first.
 * - Failed sends retry with exponential backoff. If all attempts fail,
 *   stats rows are dropped (they're cumulative — the next poll re-sends the
 *   full counters) while events are re-queued up to `maxQueuedEvents`.
 * - The server dedupes retried snapshots via a unique
 *   (fingerprint, collectedAt) index, so at-least-once delivery is safe.
 */

export interface IngestStatsRow {
  queryHash: string;
  normalizedQuery: string;
  calls: number;
  totalExecTimeMs: number;
  meanExecTimeMs: number;
  rows: number;
  sharedBlksHit: number;
  sharedBlksRead: number;
  tempBlksWritten: number;
}

export interface IngestEvent {
  queryHash: string;
  normalizedQuery: string;
  occurredAt: string;
  durationMs: number;
  source: "direct_poll" | "auto_explain";
  backendPid?: number | null;
  sessionId?: string | null;
  plan?: {
    planJson: unknown;
    planningTimeMs?: number | null;
    executionTimeMs?: number | null;
  };
}

export interface IngestClientOptions {
  url: string;
  token: string;
  databaseName: string;
  mode: ConnectionMode;
  version: string;
  fetchImpl?: typeof fetch;
  /** Total attempts per flush, including the first (default 5). */
  maxAttempts?: number;
  /** First retry delay; doubles per attempt (default 1000ms). */
  baseBackoffMs?: number;
  maxQueuedEvents?: number;
  eventFlushSize?: number;
  eventFlushDelayMs?: number;
  log?: (msg: string) => void;
}

interface PendingStats {
  collectedAt: string;
  statsRows: IngestStatsRow[];
}

export class IngestClient {
  private readonly opts: Required<Omit<IngestClientOptions, "fetchImpl" | "log">>;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (msg: string) => void;

  private pendingStats: PendingStats | null = null;
  private pendingEvents: IngestEvent[] = [];
  private flushing = false;
  private dirty = false;
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: IngestClientOptions) {
    this.opts = {
      url: options.url,
      token: options.token,
      databaseName: options.databaseName,
      mode: options.mode,
      version: options.version,
      maxAttempts: options.maxAttempts ?? 5,
      baseBackoffMs: options.baseBackoffMs ?? 1000,
      maxQueuedEvents: options.maxQueuedEvents ?? 500,
      eventFlushSize: options.eventFlushSize ?? 50,
      eventFlushDelayMs: options.eventFlushDelayMs ?? 2000,
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log = options.log ?? ((msg) => console.log(msg));
  }

  /** One poll cycle's cumulative pg_stat_statements rows. Flushes immediately. */
  submitStats(collectedAt: string, statsRows: IngestStatsRow[]): Promise<void> {
    // Newer counters supersede any stats still pending from a failed flush.
    this.pendingStats = { collectedAt, statsRows };
    return this.flush();
  }

  /** One parsed auto_explain event. Buffers; flushes on size or delay. */
  submitEvent(event: IngestEvent): void {
    this.pendingEvents.push(event);
    if (this.pendingEvents.length > this.opts.maxQueuedEvents) {
      this.pendingEvents.splice(0, this.pendingEvents.length - this.opts.maxQueuedEvents);
    }
    if (this.pendingEvents.length >= this.opts.eventFlushSize) {
      void this.flush();
    } else if (!this.eventTimer) {
      this.eventTimer = setTimeout(() => {
        this.eventTimer = null;
        void this.flush();
      }, this.opts.eventFlushDelayMs);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.eventTimer) {
      clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.stopped) return;
    if (this.flushing) {
      // A flush is in flight; remember to run again with whatever arrived.
      this.dirty = true;
      return;
    }
    if (!this.pendingStats && this.pendingEvents.length === 0) return;

    this.flushing = true;
    const stats = this.pendingStats;
    const events = this.pendingEvents;
    this.pendingStats = null;
    this.pendingEvents = [];

    try {
      const sent = await this.sendWithRetry(stats, events);
      if (!sent) {
        // Stats are cumulative — next poll re-sends the full counters.
        // Events are one-shot, so re-queue them (newest-biased, capped).
        this.pendingEvents = [...events, ...this.pendingEvents].slice(-this.opts.maxQueuedEvents);
        if (stats) {
          this.log(
            `[collector] dropping ${stats.statsRows.length} stats rows after failed delivery; next poll re-sends current counters`
          );
        }
      }
    } finally {
      this.flushing = false;
      if (this.dirty) {
        this.dirty = false;
        void this.flush();
      }
    }
  }

  private async sendWithRetry(stats: PendingStats | null, events: IngestEvent[]): Promise<boolean> {
    const body = JSON.stringify({
      databaseName: this.opts.databaseName,
      agent: { mode: this.opts.mode, version: this.opts.version },
      ...(stats ? { collectedAt: stats.collectedAt, statsRows: stats.statsRows } : {}),
      slowQueryEvents: events,
    });

    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      if (this.stopped) return false;
      try {
        const res = await this.fetchImpl(this.opts.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.token}`,
          },
          body,
        });

        if (res.ok) return true;

        // 4xx (other than 429) won't succeed on retry — bad token or bad
        // payload. Log loudly and drop rather than retrying forever.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const text = await res.text().catch(() => "");
          this.log(
            `[collector] ingest rejected (${res.status}): ${text.slice(0, 300)} — check QG_API_TOKEN and collector/API version match`
          );
          return false;
        }

        this.log(`[collector] ingest attempt ${attempt}/${this.opts.maxAttempts} got ${res.status}`);
      } catch (err) {
        this.log(
          `[collector] ingest attempt ${attempt}/${this.opts.maxAttempts} failed: ${(err as Error).message}`
        );
      }

      if (attempt < this.opts.maxAttempts) {
        await sleep(this.opts.baseBackoffMs * 2 ** (attempt - 1));
      }
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
