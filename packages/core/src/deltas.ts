/**
 * pg_stat_statements counters are cumulative since the last stats reset,
 * so raw snapshots are stored as-is (keeps ingestion idempotent under
 * retries) and per-interval deltas are computed on the read path with
 * this function. See docs/sprint-plan.md Sprint 1.
 */

export interface CumulativeSnapshotPoint {
  collectedAt: string | Date;
  calls: number;
  totalExecTimeMs: number;
  rows: number;
}

export interface SnapshotDelta {
  /** collectedAt of the snapshot that opened the interval (ISO). */
  intervalStart: string;
  /** collectedAt of the snapshot that closed the interval (ISO). */
  intervalEnd: string;
  callsDelta: number;
  totalExecTimeMsDelta: number;
  rowsDelta: number;
  /** Mean over this interval only: totalExecTimeMsDelta / callsDelta. */
  meanExecTimeMs: number;
  /** True when counters went backwards (pg_stat_statements was reset). */
  counterReset: boolean;
}

function toMs(v: string | Date): number {
  return v instanceof Date ? v.getTime() : Date.parse(v);
}

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Turns cumulative snapshots (any order, duplicates tolerated) into
 * per-interval deltas. Needs at least two distinct points to produce
 * anything. A counter reset (cumulative values dropping) treats the new
 * snapshot as a fresh baseline: the delta is the full cumulative value,
 * flagged with `counterReset` so charts can annotate the discontinuity.
 */
export function computeSnapshotDeltas(points: CumulativeSnapshotPoint[]): SnapshotDelta[] {
  const sorted = [...points]
    .filter((p) => !Number.isNaN(toMs(p.collectedAt)))
    .sort((a, b) => toMs(a.collectedAt) - toMs(b.collectedAt));

  // Retried ingests can leave duplicate rows for the same instant — keep one.
  const deduped = sorted.filter(
    (p, i) => i === 0 || toMs(p.collectedAt) !== toMs(sorted[i - 1].collectedAt)
  );

  const deltas: SnapshotDelta[] = [];
  for (let i = 1; i < deduped.length; i++) {
    const prev = deduped[i - 1];
    const curr = deduped[i];
    const reset = curr.calls < prev.calls || curr.totalExecTimeMs < prev.totalExecTimeMs;

    const callsDelta = reset ? curr.calls : curr.calls - prev.calls;
    const totalExecTimeMsDelta = reset
      ? curr.totalExecTimeMs
      : curr.totalExecTimeMs - prev.totalExecTimeMs;
    const rowsDelta = reset ? curr.rows : curr.rows - prev.rows;

    deltas.push({
      intervalStart: toIso(prev.collectedAt),
      intervalEnd: toIso(curr.collectedAt),
      callsDelta,
      totalExecTimeMsDelta,
      rowsDelta,
      meanExecTimeMs: callsDelta > 0 ? totalExecTimeMsDelta / callsDelta : 0,
      counterReset: reset,
    });
  }
  return deltas;
}
