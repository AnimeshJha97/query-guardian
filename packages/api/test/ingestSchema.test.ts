import { describe, expect, it } from "vitest";
import {
  ingestBatchSchema,
  partitionRows,
  slowQueryEventSchema,
  statsRowSchema,
} from "../src/routes/ingestSchema";

const validStatsRow = {
  queryHash: "abc123",
  normalizedQuery: "select * from books where author_id = ?",
  calls: 10,
  totalExecTimeMs: 120.5,
  meanExecTimeMs: 12.05,
  rows: 40,
};

const validEvent = {
  queryHash: "abc123",
  normalizedQuery: "select * from books where author_id = ?",
  occurredAt: "2026-07-14T10:00:00.000Z",
  durationMs: 250.3,
  source: "auto_explain",
  backendPid: 4242,
  plan: { planJson: { Plan: { "Node Type": "Seq Scan" } }, executionTimeMs: 249.9 },
};

describe("ingestBatchSchema", () => {
  it("accepts a full valid batch", () => {
    const parsed = ingestBatchSchema.safeParse({
      databaseName: "demo",
      agent: { mode: "both", version: "0.1.0" },
      collectedAt: "2026-07-14T10:00:00.000Z",
      statsRows: [validStatsRow],
      slowQueryEvents: [validEvent],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires databaseId or databaseName", () => {
    const parsed = ingestBatchSchema.safeParse({
      collectedAt: "2026-07-14T10:00:00.000Z",
      statsRows: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires collectedAt when statsRows are present", () => {
    const parsed = ingestBatchSchema.safeParse({
      databaseName: "demo",
      statsRows: [validStatsRow],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows an events-only batch without collectedAt", () => {
    const parsed = ingestBatchSchema.safeParse({
      databaseName: "demo",
      slowQueryEvents: [validEvent],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid databaseId", () => {
    const parsed = ingestBatchSchema.safeParse({ databaseId: "not-a-uuid", statsRows: [] });
    expect(parsed.success).toBe(false);
  });
});

describe("partitionRows — malformed-row handling", () => {
  it("drops malformed stats rows and keeps valid ones", () => {
    const { valid, invalid } = partitionRows(statsRowSchema, [
      validStatsRow,
      { ...validStatsRow, calls: -5 }, // negative counter
      { ...validStatsRow, calls: "many" }, // wrong type
      { ...validStatsRow, queryHash: "" }, // empty hash
      null,
      "garbage",
    ]);
    expect(valid).toHaveLength(1);
    expect(invalid).toBe(5);
    expect(valid[0].queryHash).toBe("abc123");
  });

  it("applies defaults for optional block counters", () => {
    const { valid } = partitionRows(statsRowSchema, [validStatsRow]);
    expect(valid[0].sharedBlksHit).toBe(0);
    expect(valid[0].tempBlksWritten).toBe(0);
  });

  it("drops events with invalid timestamps or sources", () => {
    const { valid, invalid } = partitionRows(slowQueryEventSchema, [
      validEvent,
      { ...validEvent, occurredAt: "yesterday" },
      { ...validEvent, source: "psychic_vision" },
    ]);
    expect(valid).toHaveLength(1);
    expect(invalid).toBe(2);
  });

  it("accepts events without a plan", () => {
    const { plan: _plan, ...eventWithoutPlan } = validEvent;
    const { valid, invalid } = partitionRows(slowQueryEventSchema, [eventWithoutPlan]);
    expect(valid).toHaveLength(1);
    expect(invalid).toBe(0);
    expect(valid[0].plan).toBeUndefined();
  });
});
