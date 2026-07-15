import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { computeSnapshotDeltas } from "@query-guardian/core";
import { db } from "../db/client.js";
import {
  queryFingerprints,
  queryStatsSnapshots,
  queryStatsDailyRollups,
  slowQueryEvents,
  explainPlans,
  indexSuggestions,
} from "../db/schema.js";
import { requireAdmin } from "../auth.js";

const idParam = z.object({ id: z.string().uuid() }).strict();

export async function queryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  // List fingerprints joined with their most recent stats snapshot,
  // sorted by total execution time — the primary "what's slow" view.
  app.get("/queries", async () => {
    // DISTINCT ON picks exactly one (the newest) snapshot per fingerprint —
    // a plain left join returns one row per snapshot once ingestion has
    // accumulated history.
    const latest = db
      .selectDistinctOn([queryStatsSnapshots.fingerprintId])
      .from(queryStatsSnapshots)
      .orderBy(queryStatsSnapshots.fingerprintId, desc(queryStatsSnapshots.collectedAt))
      .as("latest_snapshot");

    const suggestionCounts = db
      .select({
        fingerprintId: indexSuggestions.fingerprintId,
        suggestionCount: sql<number>`count(*)::int`.as("suggestion_count"),
        pendingSuggestionCount:
          sql<number>`count(*) filter (where ${indexSuggestions.status} = 'pending')::int`.as(
            "pending_suggestion_count"
          ),
      })
      .from(indexSuggestions)
      .groupBy(indexSuggestions.fingerprintId)
      .as("suggestion_counts");

    const rows = await db
      .select({
        fingerprint: queryFingerprints,
        latestSnapshot: {
          id: latest.id,
          fingerprintId: latest.fingerprintId,
          collectedAt: latest.collectedAt,
          calls: latest.calls,
          totalExecTimeMs: latest.totalExecTimeMs,
          meanExecTimeMs: latest.meanExecTimeMs,
          rows: latest.rows,
          sharedBlksHit: latest.sharedBlksHit,
          sharedBlksRead: latest.sharedBlksRead,
          tempBlksWritten: latest.tempBlksWritten,
        },
        suggestionCount: suggestionCounts.suggestionCount,
        pendingSuggestionCount: suggestionCounts.pendingSuggestionCount,
      })
      .from(queryFingerprints)
      .leftJoin(latest, eq(latest.fingerprintId, queryFingerprints.id))
      .leftJoin(suggestionCounts, eq(suggestionCounts.fingerprintId, queryFingerprints.id))
      .orderBy(sql`${latest.totalExecTimeMs} DESC NULLS LAST`)
      .limit(200);

    // Left-join misses come back as an object of nulls — normalize to null.
    return rows.map((row) => ({
      fingerprint: row.fingerprint,
      latestSnapshot: row.latestSnapshot?.id ? row.latestSnapshot : null,
      suggestionCount: row.suggestionCount ?? 0,
      pendingSuggestionCount: row.pendingSuggestionCount ?? 0,
    }));
  });

  app.get("/queries/:id", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const [fingerprint] = await db
      .select()
      .from(queryFingerprints)
      .where(eq(queryFingerprints.id, parsed.data.id));

    if (!fingerprint) return reply.code(404).send({ error: "not found" });

    const snapshots = await db
      .select()
      .from(queryStatsSnapshots)
      .where(eq(queryStatsSnapshots.fingerprintId, fingerprint.id))
      .orderBy(desc(queryStatsSnapshots.collectedAt))
      .limit(500);

    const rollups = await db
      .select()
      .from(queryStatsDailyRollups)
      .where(eq(queryStatsDailyRollups.fingerprintId, fingerprint.id))
      .orderBy(desc(queryStatsDailyRollups.bucketDate))
      .limit(365);

    // Raw snapshots are cumulative pg_stat_statements counters; deltas are
    // the per-interval view (computed at read time — see core/deltas.ts).
    const deltas = computeSnapshotDeltas(snapshots);

    return { fingerprint, snapshots, deltas, rollups };
  });

  // Most recent EXPLAIN plan captured for this fingerprint via auto_explain.
  app.get("/queries/:id/explain", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const [latestEvent] = await db
      .select()
      .from(slowQueryEvents)
      .where(eq(slowQueryEvents.fingerprintId, parsed.data.id))
      .orderBy(desc(slowQueryEvents.occurredAt))
      .limit(1);

    if (!latestEvent) {
      return reply.code(404).send({ error: "no captured slow-query events for this fingerprint yet" });
    }

    const [plan] = await db
      .select()
      .from(explainPlans)
      .where(eq(explainPlans.slowQueryEventId, latestEvent.id))
      .orderBy(desc(explainPlans.createdAt))
      .limit(1);

    return { event: latestEvent, plan: plan ?? null };
  });
}
