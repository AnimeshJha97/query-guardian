import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  collectorAgents,
  explainPlans,
  monitoredDatabases,
  queryFingerprints,
  queryStatsSnapshots,
  slowQueryEvents,
} from "../db/schema.js";
import { getDefaultOrgId } from "../db/defaultOrg.js";
import { requireCollector } from "../auth.js";
import { persistIndexSuggestionsFromPlan } from "../jobs/indexSuggestions.js";
import {
  ingestBatchSchema,
  partitionRows,
  slowQueryEventSchema,
  statsRowSchema,
  type IngestBatch,
} from "./ingestSchema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolves the monitored database this batch belongs to. A collector that
 * only knows its target by name (the Compose demo path) auto-registers a
 * row on first ingest so `docker compose up` needs no manual setup; the
 * placeholder DSN marks the row as collector-registered — the collector
 * holds the real DSN in its own env and never sends it here.
 */
async function resolveDatabase(tx: Tx, batch: IngestBatch) {
  if (batch.databaseId) {
    const [row] = await tx
      .select()
      .from(monitoredDatabases)
      .where(eq(monitoredDatabases.id, batch.databaseId));
    return row ?? null;
  }

  const name = batch.databaseName!;
  const [existing] = await tx
    .select()
    .from(monitoredDatabases)
    .where(eq(monitoredDatabases.name, name));
  if (existing) return existing;

  const [created] = await tx
    .insert(monitoredDatabases)
    .values({
      orgId: await getDefaultOrgId(tx),
      name,
      connectionMode: batch.agent?.mode ?? "both",
      dsnEncrypted: "UNSET:registered-by-collector",
      status: "pending",
    })
    .returning();
  return created;
}

export async function ingestRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCollector);

  // Internal endpoint: the collector posts batches of fingerprinted
  // pg_stat_statements rows and parsed auto_explain events here.
  app.post("/ingest", async (req, reply) => {
    const parsed = ingestBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const batch = parsed.data;

    const stats = partitionRows(statsRowSchema, batch.statsRows);
    const events = partitionRows(slowQueryEventSchema, batch.slowQueryEvents);

    const result = await db.transaction(async (tx) => {
      const database = await resolveDatabase(tx, batch);
      if (!database) return null;

      // Upsert fingerprints for every hash in the batch (stats + events).
      const byHash = new Map<string, string>();
      for (const row of [...stats.valid, ...events.valid]) {
        if (!byHash.has(row.queryHash)) byHash.set(row.queryHash, row.normalizedQuery);
      }

      const fingerprintIdByHash = new Map<string, string>();
      if (byHash.size > 0) {
        const upserted = await tx
          .insert(queryFingerprints)
          .values(
            [...byHash.entries()].map(([queryHash, normalizedQuery]) => ({
              databaseId: database.id,
              queryHash,
              normalizedQuery,
            }))
          )
          .onConflictDoUpdate({
            target: [queryFingerprints.databaseId, queryFingerprints.queryHash],
            set: { lastSeenAt: sql`now()` },
          })
          .returning({ id: queryFingerprints.id, queryHash: queryFingerprints.queryHash });
        for (const fp of upserted) fingerprintIdByHash.set(fp.queryHash, fp.id);
      }

      // Cumulative snapshots stored raw; the unique (fingerprint, collectedAt)
      // index makes retried batches no-ops. Deltas are computed on read.
      let snapshotsInserted = 0;
      if (stats.valid.length > 0) {
        const collectedAt = new Date(batch.collectedAt!);
        const inserted = await tx
          .insert(queryStatsSnapshots)
          .values(
            stats.valid.map((row) => ({
              fingerprintId: fingerprintIdByHash.get(row.queryHash)!,
              collectedAt,
              calls: row.calls,
              totalExecTimeMs: row.totalExecTimeMs,
              meanExecTimeMs: row.meanExecTimeMs,
              rows: row.rows,
              sharedBlksHit: row.sharedBlksHit,
              sharedBlksRead: row.sharedBlksRead,
              tempBlksWritten: row.tempBlksWritten,
            }))
          )
          .onConflictDoNothing({
            target: [queryStatsSnapshots.fingerprintId, queryStatsSnapshots.collectedAt],
          })
          .returning({ id: queryStatsSnapshots.id });
        snapshotsInserted = inserted.length;
      }

      // Slow-query events + their EXPLAIN plans. Events have no natural
      // idempotency key (identical queries legitimately fire at the same
      // millisecond in N+1 bursts), so dedupe relies on the transaction:
      // a failed batch rolls back entirely and the retry starts clean.
      let eventsInserted = 0;
      let plansInserted = 0;
      let indexSuggestionsInserted = 0;
      if (events.valid.length > 0) {
        const insertedEvents = await tx
          .insert(slowQueryEvents)
          .values(
            events.valid.map((ev) => ({
              fingerprintId: fingerprintIdByHash.get(ev.queryHash)!,
              databaseId: database.id,
              occurredAt: new Date(ev.occurredAt),
              durationMs: ev.durationMs,
              source: ev.source,
              backendPid: ev.backendPid ?? null,
              sessionId: ev.sessionId ?? null,
            }))
          )
          .returning({ id: slowQueryEvents.id });
        eventsInserted = insertedEvents.length;

        // INSERT ... RETURNING preserves VALUES order, so index i of the
        // returned ids matches events.valid[i].
        const planValues = events.valid.flatMap((ev, i) =>
          ev.plan
            ? [
                {
                  slowQueryEventId: insertedEvents[i].id,
                  planJson: ev.plan.planJson,
                  planningTimeMs: ev.plan.planningTimeMs ?? null,
                  executionTimeMs: ev.plan.executionTimeMs ?? null,
                },
              ]
            : []
        );
        if (planValues.length > 0) {
          const insertedPlans = await tx
            .insert(explainPlans)
            .values(planValues)
            .returning({ id: explainPlans.id });
          plansInserted = insertedPlans.length;

          for (const ev of events.valid) {
            if (!ev.plan) continue;
            indexSuggestionsInserted += await persistIndexSuggestionsFromPlan(tx, {
              databaseId: database.id,
              fingerprintId: fingerprintIdByHash.get(ev.queryHash)!,
              planJson: ev.plan.planJson,
            });
          }
        }
      }

      // Heartbeat for the reporting agent.
      if (batch.agent) {
        const [existingAgent] = await tx
          .select()
          .from(collectorAgents)
          .where(
            and(
              eq(collectorAgents.databaseId, database.id),
              eq(collectorAgents.mode, batch.agent.mode)
            )
          );
        if (existingAgent) {
          await tx
            .update(collectorAgents)
            .set({ lastHeartbeatAt: sql`now()`, version: batch.agent.version })
            .where(eq(collectorAgents.id, existingAgent.id));
        } else {
          await tx.insert(collectorAgents).values({
            databaseId: database.id,
            mode: batch.agent.mode,
            version: batch.agent.version,
          });
        }
      }

      // Successful ingest = the collector reached both the target DB and us.
      await tx
        .update(monitoredDatabases)
        .set({ lastPolledAt: sql`now()`, status: "healthy" })
        .where(eq(monitoredDatabases.id, database.id));

      return {
        databaseId: database.id,
        fingerprintsUpserted: fingerprintIdByHash.size,
        snapshotsInserted,
        eventsInserted,
        plansInserted,
        indexSuggestionsInserted,
      };
    });

    if (!result) {
      return reply.code(404).send({ error: "monitored database not found" });
    }

    return reply.code(200).send({
      ...result,
      rejected: { statsRows: stats.invalid, slowQueryEvents: events.invalid },
    });
  });
}
