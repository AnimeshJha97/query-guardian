import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  clearSessionCookie,
  createSessionToken,
  requireAdmin,
  sessionCookie,
  verifyAdminPassword,
} from "../auth.js";

const loginSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function consumeAttempt(key: string, now = Date.now()) {
  const current = attempts.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  entry.count++;
  attempts.set(key, entry);
  return entry;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = attempts.get(req.ip);
    if (existing && existing.resetAt > Date.now() && existing.count >= MAX_ATTEMPTS) {
      reply.header("Retry-After", Math.ceil((existing.resetAt - Date.now()) / 1000));
      return reply.code(429).send({ error: "Too many login attempts. Try again later." });
    }

    let valid = false;
    try {
      valid = await verifyAdminPassword(parsed.data.password);
    } catch (error) {
      req.log.error({ error }, "admin authentication is not configured");
      return reply.code(503).send({ error: "Authentication is not configured." });
    }
    if (!valid) {
      consumeAttempt(req.ip);
      return reply.code(401).send({ error: "Invalid credentials." });
    }

    attempts.delete(req.ip);
    reply.header("Set-Cookie", sessionCookie(createSessionToken()));
    return { authenticated: true };
  });

  app.get("/auth/session", { preHandler: requireAdmin }, async () => ({ authenticated: true }));
  app.post("/auth/logout", { preHandler: requireAdmin }, async (_req, reply) => {
    reply.header("Set-Cookie", clearSessionCookie());
    return { authenticated: false };
  });
}
