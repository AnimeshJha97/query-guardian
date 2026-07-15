import { z } from "zod";

/**
 * Validation for POST /api/ingest — kept free of DB imports so the schemas
 * and row-partitioning logic are unit-testable without a live metadata store.
 *
 * Batch-level structure is strict (a malformed envelope is a collector bug
 * and gets a 400), but individual stats rows / events are validated one by
 * one and bad rows are dropped and counted rather than failing the batch —
 * one weird row must not block an otherwise healthy poll cycle.
 */

const isoTimestamp = z.string().datetime({ offset: true });

export const statsRowSchema = z.object({
  queryHash: z.string().min(1).max(64),
  normalizedQuery: z.string().min(1),
  calls: z.number().int().nonnegative(),
  totalExecTimeMs: z.number().nonnegative(),
  meanExecTimeMs: z.number().nonnegative(),
  rows: z.number().int().nonnegative(),
  sharedBlksHit: z.number().int().nonnegative().default(0),
  sharedBlksRead: z.number().int().nonnegative().default(0),
  tempBlksWritten: z.number().int().nonnegative().default(0),
}).strict();
export type IngestStatsRow = z.infer<typeof statsRowSchema>;

export const slowQueryEventSchema = z.object({
  queryHash: z.string().min(1).max(64),
  normalizedQuery: z.string().min(1),
  occurredAt: isoTimestamp,
  durationMs: z.number().nonnegative(),
  source: z.enum(["direct_poll", "auto_explain"]),
  backendPid: z.number().int().nullish(),
  sessionId: z.string().nullish(),
  plan: z
    .object({
      planJson: z.unknown().refine((v) => v != null, "planJson is required"),
      planningTimeMs: z.number().nullish(),
      executionTimeMs: z.number().nullish(),
    }).strict()
    .optional(),
}).strict();
export type IngestSlowQueryEvent = z.infer<typeof slowQueryEventSchema>;

export const ingestBatchSchema = z
  .object({
    databaseId: z.string().uuid().optional(),
    databaseName: z.string().min(1).max(200).optional(),
    agent: z
      .object({
        mode: z.enum(["direct", "log_tail", "both"]),
        version: z.string().min(1).max(64),
      }).strict()
      .optional(),
    collectedAt: isoTimestamp.optional(),
    statsRows: z.array(z.unknown()).max(2000).default([]),
    slowQueryEvents: z.array(z.unknown()).max(2000).default([]),
  }).strict()
  .refine((b) => !!b.databaseId || !!b.databaseName, {
    message: "either databaseId or databaseName is required",
  })
  .refine((b) => b.statsRows.length === 0 || !!b.collectedAt, {
    message: "collectedAt is required when statsRows are present",
  });
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

/**
 * Validates rows individually: malformed rows are dropped and counted,
 * valid rows pass through typed.
 */
export function partitionRows<Schema extends z.ZodTypeAny>(
  schema: Schema,
  rows: unknown[]
): { valid: z.infer<Schema>[]; invalid: number } {
  const valid: z.infer<Schema>[] = [];
  let invalid = 0;
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    else invalid++;
  }
  return { valid, invalid };
}
