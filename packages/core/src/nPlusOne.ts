import type { SlowQueryEvent } from "./types.js";

export interface NPlusOneCandidate {
  patternHash: string;
  fingerprintIds: string[];
  occurrencesInWindow: number;
  windowSeconds: number;
  firstEventAt: string;
  lastEventAt: string;
}

export interface NPlusOneDetectorOptions {
  /** Minimum repeats of the same fingerprint within the window to flag. */
  minOccurrences: number;
  /** Sliding window size, in seconds. */
  windowSeconds: number;
}

const DEFAULT_OPTIONS: NPlusOneDetectorOptions = {
  minOccurrences: 5,
  windowSeconds: 0.2, // 200ms — same request/session firing repeated near-identical queries
};

/**
 * Detects N+1 patterns: the same query fingerprint executed many times
 * in a short window, typically from the same backend process — the
 * classic signature of an ORM lazy-loading a collection one row at a time.
 *
 * v1: groups by (backendPid, fingerprintId) and flags bursts. Does not
 * yet correlate *different* fingerprints that belong to the same logical
 * N+1 chain (e.g. a parent lookup followed by N child lookups) — that's
 * a good v2 improvement once there's real usage data to tune against.
 */
export function detectNPlusOne(
  events: SlowQueryEvent[],
  options: Partial<NPlusOneDetectorOptions> = {}
): NPlusOneCandidate[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const candidates: NPlusOneCandidate[] = [];

  const groups = new Map<string, SlowQueryEvent[]>();
  for (const e of events) {
    if (e.backendPid == null) continue;
    const key = `${e.backendPid}:${e.fingerprintId}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  for (const [key, groupEvents] of groups) {
    const sorted = [...groupEvents].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );

    let windowStart = 0;
    for (let i = 0; i < sorted.length; i++) {
      const currentTime = new Date(sorted[i].occurredAt).getTime();

      while (
        windowStart < i &&
        (currentTime - new Date(sorted[windowStart].occurredAt).getTime()) / 1000 >
          opts.windowSeconds
      ) {
        windowStart++;
      }

      const countInWindow = i - windowStart + 1;
      if (countInWindow >= opts.minOccurrences) {
        const [, fingerprintId] = key.split(":");
        candidates.push({
          patternHash: key,
          fingerprintIds: [fingerprintId],
          occurrencesInWindow: countInWindow,
          windowSeconds: opts.windowSeconds,
          firstEventAt: sorted[windowStart].occurredAt,
          lastEventAt: sorted[i].occurredAt,
        });
        break; // one candidate per group is enough for v1; avoid duplicate overlapping flags
      }
    }
  }

  return candidates;
}
