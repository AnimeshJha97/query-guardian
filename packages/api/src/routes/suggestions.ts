import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { indexSuggestions } from "../db/schema.js";
import { requireAdmin } from "../auth.js";

const updateStatusSchema = z.object({
  status: z.enum(["pending", "applied", "dismissed"]),
}).strict();

export async function suggestionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/suggestions", async () => {
    return db.select().from(indexSuggestions);
  });

  app.patch("/suggestions/:id", async (req, reply) => {
    const idParsed = z.object({ id: z.string().uuid() }).strict().safeParse(req.params);
    const bodyParsed = updateStatusSchema.safeParse(req.body);
    if (!idParsed.success || !bodyParsed.success) {
      return reply.code(400).send({ error: "invalid request" });
    }

    const [updated] = await db
      .update(indexSuggestions)
      .set({ status: bodyParsed.data.status })
      .where(eq(indexSuggestions.id, idParsed.data.id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });
}
