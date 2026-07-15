import { describe, expect, it, vi } from "vitest";
import { IngestClient, type IngestEvent, type IngestStatsRow } from "../src/apiClient";

const statsRow: IngestStatsRow = {
  queryHash: "abc123",
  normalizedQuery: "select * from books where author_id = ?",
  calls: 10,
  totalExecTimeMs: 120.5,
  meanExecTimeMs: 12.05,
  rows: 40,
  sharedBlksHit: 0,
  sharedBlksRead: 0,
  tempBlksWritten: 0,
};

const event: IngestEvent = {
  queryHash: "abc123",
  normalizedQuery: "select * from books where author_id = ?",
  occurredAt: "2026-07-14T10:00:00.000Z",
  durationMs: 250,
  source: "auto_explain",
};

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

function errorResponse(status: number) {
  return new Response("boom", { status });
}

function makeClient(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new IngestClient({
    url: "http://api:4000/api/ingest",
    token: "secret-token",
    databaseName: "demo",
    mode: "both",
    version: "0.1.0",
    fetchImpl,
    maxAttempts: 3,
    baseBackoffMs: 1, // real timers, negligible delay
    log: () => {},
    ...overrides,
  });
}

describe("IngestClient", () => {
  it("posts one authenticated batch with stats and agent info", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const client = makeClient(fetchMock);

    await client.submitStats("2026-07-14T10:00:00.000Z", [statsRow]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:4000/api/ingest");
    expect(init.headers.Authorization).toBe("Bearer secret-token");

    const body = JSON.parse(init.body);
    expect(body.databaseName).toBe("demo");
    expect(body.agent).toEqual({ mode: "both", version: "0.1.0" });
    expect(body.collectedAt).toBe("2026-07-14T10:00:00.000Z");
    expect(body.statsRows).toHaveLength(1);
    expect(body.slowQueryEvents).toEqual([]);
  });

  it("retries on 5xx with backoff until success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse());
    const client = makeClient(fetchMock);

    await client.submitStats("2026-07-14T10:00:00.000Z", [statsRow]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Every attempt re-sends the identical payload (server dedupes).
    const bodies = fetchMock.mock.calls.map(([, init]) => init.body);
    expect(new Set(bodies).size).toBe(1);
  });

  it("retries on network errors and gives up after maxAttempts", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = makeClient(fetchMock);

    await client.submitStats("2026-07-14T10:00:00.000Z", [statsRow]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx rejection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401));
    const client = makeClient(fetchMock);

    await client.submitStats("2026-07-14T10:00:00.000Z", [statsRow]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-queues events after a failed flush but drops stats", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(okResponse());
    // Large flush delay so the event buffer only flushes when we say so.
    const client = makeClient(fetchMock, { eventFlushDelayMs: 60_000 });

    client.submitEvent(event);
    await client.flush(); // exhausts 3 attempts, re-queues the event

    expect(fetchMock).toHaveBeenCalledTimes(3);

    await client.flush(); // succeeds now
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const lastBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(lastBody.slowQueryEvents).toHaveLength(1);
    expect(lastBody.statsRows).toBeUndefined(); // stats were dropped, not replayed
    client.stop();
  });

  it("flushes automatically when the event buffer reaches eventFlushSize", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const client = makeClient(fetchMock, { eventFlushSize: 3, eventFlushDelayMs: 60_000 });

    client.submitEvent(event);
    client.submitEvent(event);
    expect(fetchMock).not.toHaveBeenCalled();

    client.submitEvent(event); // hits the threshold
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.slowQueryEvents).toHaveLength(3);
    client.stop();
  });

  it("caps the event queue at maxQueuedEvents, keeping the newest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const client = makeClient(fetchMock, {
      maxQueuedEvents: 2,
      eventFlushSize: 100,
      eventFlushDelayMs: 60_000,
    });

    client.submitEvent({ ...event, durationMs: 1 });
    client.submitEvent({ ...event, durationMs: 2 });
    client.submitEvent({ ...event, durationMs: 3 });
    await client.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.slowQueryEvents.map((e: IngestEvent) => e.durationMs)).toEqual([2, 3]);
    client.stop();
  });
});
