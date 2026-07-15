import type { FastifyInstance } from "fastify";
import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  buildSetupSql,
  checkTargetPermissions,
  quotePostgresIdentifier,
  TARGET_PERMISSION_FIXES,
} from "@query-guardian/core";
import { db } from "../db/client.js";
import { collectorAgents, monitoredDatabases } from "../db/schema.js";
import { getDefaultOrgId } from "../db/defaultOrg.js";
import { requireAdmin } from "../auth.js";
import { encryptDsn } from "../crypto.js";

const createDatabaseSchema = z.object({
  name: z.string().min(1),
  dsn: z.string().min(1),
  connectionMode: z.enum(["direct", "log_tail", "both"]).default("both"),
  sslMode: z.enum(["require", "verify-full"]).default("verify-full"),
}).strict();

const preflightSchema = z.object({
  dsn: z.string().min(1),
  sslMode: z.enum(["require", "verify-full"]).optional(),
}).strict();

type DatabaseRow = typeof monitoredDatabases.$inferSelect;

function serializeDatabase(row: DatabaseRow, lastHeartbeatAt: Date | null = null) {
  return {
    id: row.id,
    name: row.name,
    connectionMode: row.connectionMode,
    sslMode: row.sslMode,
    status: row.status,
    lastPolledAt: row.lastPolledAt,
    lastHeartbeatAt,
    createdAt: row.createdAt,
  };
}

function sslModeFromDsn(dsn: string): "require" | "verify-full" {
  try {
    const value = new URL(dsn).searchParams.get("sslmode");
    return value === "require" || value === "verify-full" ? value : "verify-full";
  } catch {
    return "verify-full";
  }
}

function createPreflightPool(dsn: string, sslMode: "require" | "verify-full") {
  return new pg.Pool({
    connectionString: dsn,
    ssl:
      sslMode === "verify-full"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });
}

function parseDsnForSetup(dsn: string) {
  try {
    const url = new URL(dsn);
    const roleName = decodeURIComponent(url.username || "query_guardian_reader");
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "your_database";

    return { roleName, password, databaseName };
  } catch {
    return {
      roleName: "query_guardian_reader",
      password: undefined,
      databaseName: "your_database",
    };
  }
}

function redactConnectionError(err: unknown, dsn: string) {
  let message = (err as Error).message ?? "Connection failed";
  message = message.replaceAll(dsn, "[redacted dsn]");

  try {
    const url = new URL(dsn);
    if (url.password) {
      message = message.replaceAll(decodeURIComponent(url.password), "[redacted password]");
      message = message.replaceAll(url.password, "[redacted password]");
    }
  } catch {
    // Non-URL input is already covered by replacing the raw DSN above.
  }

  return message;
}

export async function databaseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/databases", async () => {
    const rows = await db
      .select({
        database: monitoredDatabases,
        lastHeartbeatAt: sql<Date | null>`max(${collectorAgents.lastHeartbeatAt})`,
      })
      .from(monitoredDatabases)
      .leftJoin(collectorAgents, eq(collectorAgents.databaseId, monitoredDatabases.id))
      .groupBy(monitoredDatabases.id);

    return rows.map((row) => serializeDatabase(row.database, row.lastHeartbeatAt));
  });

  app.post("/databases/preflight", async (req, reply) => {
    const parsed = preflightSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const dsn = parsed.data.dsn;
    const sslMode = parsed.data.sslMode ?? sslModeFromDsn(dsn);
    const setup = parseDsnForSetup(dsn);
    const setupSql = buildSetupSql(setup);
    const pool = createPreflightPool(dsn, sslMode);

    let canConnect = false;
    let canReadStats = false;
    let canReadStatements = false;
    const errors: string[] = [];

    try {
      await pool.query("SELECT 1");
      canConnect = true;

      const permissions = await checkTargetPermissions(pool);
      canReadStats = permissions.canReadStats;
      canReadStatements = permissions.canReadStatements;
      errors.push(...permissions.errors.map((err) => err.replaceAll(dsn, "[redacted dsn]")));
    } catch (err) {
      errors.push(`Cannot connect: ${redactConnectionError(err, dsn)}`);
    } finally {
      await pool.end().catch(() => undefined);
    }

    const role = quotePostgresIdentifier(setup.roleName);
    const missing = [
      ...(canConnect
        ? []
        : [{ key: "connect", label: "Can connect to database", sql: setupSql }]),
      ...(canConnect && !canReadStats
        ? [
            {
              key: "stats",
              label: TARGET_PERMISSION_FIXES.stats.label,
              sql: TARGET_PERMISSION_FIXES.stats.sql.replace("{role}", role),
            },
          ]
        : []),
      ...(canConnect && !canReadStatements
        ? [
            {
              key: "statements",
              label: TARGET_PERMISSION_FIXES.statements.label,
              sql: TARGET_PERMISSION_FIXES.statements.sql,
            },
          ]
        : []),
    ];

    return {
      canConnect,
      canReadStats,
      canReadStatements,
      sslMode,
      setupSql,
      missing,
      errors,
    };
  });

  app.post("/databases", async (req, reply) => {
    const parsed = createDatabaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const dsnEncrypted = encryptDsn(parsed.data.dsn);

    const [created] = await db
      .insert(monitoredDatabases)
      .values({
        orgId: await getDefaultOrgId(),
        name: parsed.data.name,
        connectionMode: parsed.data.connectionMode,
        sslMode: parsed.data.sslMode,
        dsnEncrypted,
        status: "pending",
      })
      .returning();

    return reply.code(201).send(serializeDatabase(created));
  });
}
