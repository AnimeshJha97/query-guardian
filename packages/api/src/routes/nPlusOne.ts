import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { nPlusOnePatterns } from "../db/schema.js";
import { requireAdmin } from "../auth.js";

export async function nPlusOneRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/n-plus-one", async () => {
    return db
      .select()
      .from(nPlusOnePatterns)
      .orderBy(
        sql`case when ${nPlusOnePatterns.status} = 'open' then 0 else 1 end`,
        desc(nPlusOnePatterns.detectedAt)
      );
  });
}
