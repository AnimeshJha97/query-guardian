import { describe, expect, it } from "vitest";
import { detectNPlusOne, type SlowQueryEvent } from "../src";

function event(offsetMs: number): SlowQueryEvent {
  return {
    id: String(offsetMs),
    fingerprintId: "fingerprint-1",
    databaseId: "database-1",
    occurredAt: new Date(Date.UTC(2026, 6, 15) + offsetMs).toISOString(),
    durationMs: 1,
    source: "auto_explain",
    backendPid: 42,
    sessionId: null,
  };
}

describe("detectNPlusOne", () => {
  it("detects a tight repeated-query burst", () => {
    const result = detectNPlusOne([0, 20, 40, 60, 80].map(event));
    expect(result).toHaveLength(1);
    expect(result[0].occurrencesInWindow).toBe(5);
  });

  it("advances the sliding window across widely spaced events", () => {
    const result = detectNPlusOne([0, 500, 1_000, 1_500, 2_000].map(event));
    expect(result).toEqual([]);
  });
});
