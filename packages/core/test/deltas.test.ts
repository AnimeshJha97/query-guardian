import { describe, expect, it } from "vitest";
import { computeSnapshotDeltas } from "../src/deltas";

const at = (minute: number) => `2026-07-14T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("computeSnapshotDeltas", () => {
  it("returns nothing for fewer than two points", () => {
    expect(computeSnapshotDeltas([])).toEqual([]);
    expect(
      computeSnapshotDeltas([{ collectedAt: at(0), calls: 10, totalExecTimeMs: 100, rows: 50 }])
    ).toEqual([]);
  });

  it("computes per-interval deltas from cumulative counters", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
      { collectedAt: at(1), calls: 150, totalExecTimeMs: 1600, rows: 640 },
      { collectedAt: at(2), calls: 160, totalExecTimeMs: 1650, rows: 680 },
    ]);

    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toMatchObject({
      intervalStart: at(0),
      intervalEnd: at(1),
      callsDelta: 50,
      totalExecTimeMsDelta: 600,
      rowsDelta: 240,
      meanExecTimeMs: 12,
      counterReset: false,
    });
    expect(deltas[1].callsDelta).toBe(10);
    expect(deltas[1].meanExecTimeMs).toBe(5);
  });

  it("sorts unordered input by collectedAt", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: at(1), calls: 150, totalExecTimeMs: 1600, rows: 640 },
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
    ]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].callsDelta).toBe(50);
  });

  it("treats a counter reset as a fresh baseline", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
      // pg_stat_statements_reset() ran: cumulative counters dropped.
      { collectedAt: at(1), calls: 20, totalExecTimeMs: 90, rows: 80 },
    ]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      callsDelta: 20,
      totalExecTimeMsDelta: 90,
      rowsDelta: 80,
      counterReset: true,
    });
  });

  it("ignores duplicate timestamps from retried ingests", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
      { collectedAt: at(1), calls: 120, totalExecTimeMs: 1200, rows: 480 },
    ]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].callsDelta).toBe(20);
  });

  it("reports zero mean when no calls happened in the interval", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: at(0), calls: 100, totalExecTimeMs: 1000, rows: 400 },
      { collectedAt: at(1), calls: 100, totalExecTimeMs: 1000, rows: 400 },
    ]);
    expect(deltas[0].callsDelta).toBe(0);
    expect(deltas[0].meanExecTimeMs).toBe(0);
  });

  it("accepts Date objects for collectedAt", () => {
    const deltas = computeSnapshotDeltas([
      { collectedAt: new Date(at(0)), calls: 10, totalExecTimeMs: 100, rows: 10 },
      { collectedAt: new Date(at(1)), calls: 20, totalExecTimeMs: 300, rows: 20 },
    ]);
    expect(deltas[0]).toMatchObject({ callsDelta: 10, totalExecTimeMsDelta: 200 });
  });
});
