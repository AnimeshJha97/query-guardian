import { detectNPlusOne } from "@query-guardian/core";
import type { SlowQueryEvent } from "@query-guardian/core";
import { and, eq, gte, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { nPlusOnePatterns, slowQueryEvents } from "../db/schema.js";

export interface DetectPatternsOptions {
  lookbackSeconds?: number;
  minOccurrences?: number;
  windowSeconds?: number;
}

export interface DetectPatternsResult {
  eventsScanned: number;
  patternsOpenedOrRefreshed: number;
  patternsResolved: number;
}

export async function detectAndPersistNPlusOne(
  options: DetectPatternsOptions = {}
): Promise<DetectPatternsResult> {
  const lookbackSeconds =
    options.lookbackSeconds ?? numberFromEnv("QG_N_PLUS_ONE_LOOKBACK_SECONDS", 60);
  const minOccurrences =
    options.minOccurrences ?? numberFromEnv("QG_N_PLUS_ONE_MIN_OCCURRENCES", 5);
  const windowSeconds =
    options.windowSeconds ?? numberFromEnv("QG_N_PLUS_ONE_WINDOW_SECONDS", 0.2);
  const cutoff = new Date(Date.now() - lookbackSeconds * 1000);

  const recentRows = await db
    .select()
    .from(slowQueryEvents)
    .where(gte(slowQueryEvents.occurredAt, cutoff));

  const databaseIdByFingerprint = new Map<string, string>();
  const events: SlowQueryEvent[] = recentRows.map((event) => {
    databaseIdByFingerprint.set(event.fingerprintId, event.databaseId);
    return {
      id: event.id,
      fingerprintId: event.fingerprintId,
      databaseId: event.databaseId,
      occurredAt: event.occurredAt.toISOString(),
      durationMs: event.durationMs,
      source: event.source,
      backendPid: event.backendPid,
      sessionId: event.sessionId,
    };
  });

  const candidates = detectNPlusOne(events, { minOccurrences, windowSeconds });
  const activeHashes = new Set<string>();
  let patternsOpenedOrRefreshed = 0;

  for (const candidate of candidates) {
    const databaseId = databaseIdByFingerprint.get(candidate.fingerprintIds[0]);
    if (!databaseId) continue;

    activeHashes.add(candidate.patternHash);
    await db
      .insert(nPlusOnePatterns)
      .values({
        databaseId,
        patternHash: candidate.patternHash,
        fingerprintIds: candidate.fingerprintIds,
        occurrencesInWindow: candidate.occurrencesInWindow,
        windowSeconds: candidate.windowSeconds,
        status: "open",
      })
      .onConflictDoUpdate({
        target: nPlusOnePatterns.patternHash,
        set: {
          fingerprintIds: candidate.fingerprintIds,
          occurrencesInWindow: candidate.occurrencesInWindow,
          windowSeconds: candidate.windowSeconds,
          detectedAt: sql`now()`,
          status: "open",
        },
      });
    patternsOpenedOrRefreshed++;
  }

  const resolved = await db
    .update(nPlusOnePatterns)
    .set({ status: "resolved" })
    .where(
      activeHashes.size > 0
        ? and(
            eq(nPlusOnePatterns.status, "open"),
            notInArray(nPlusOnePatterns.patternHash, [...activeHashes])
          )
        : eq(nPlusOnePatterns.status, "open")
    )
    .returning({ id: nPlusOnePatterns.id });

  return {
    eventsScanned: events.length,
    patternsOpenedOrRefreshed,
    patternsResolved: resolved.length,
  };
}

export function startPatternDetectionJob(
  log: Pick<Console, "info" | "error"> = console
): () => void {
  const intervalMs = numberFromEnv("QG_PATTERN_DETECTION_INTERVAL_MS", 15_000);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await detectAndPersistNPlusOne();
      if (result.patternsOpenedOrRefreshed > 0 || result.patternsResolved > 0) {
        log.info({ result }, "n+1 detection job completed");
      }
    } catch (err) {
      log.error({ err }, "n+1 detection job failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  void run();
  return () => clearInterval(timer);
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
