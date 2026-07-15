import type { FastifyReply, FastifyRequest } from "fastify";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

export const SESSION_COOKIE = "qg_session";
const SESSION_TTL_SECONDS = 30 * 60;

type SessionPayload = { sub: "admin"; exp: number; iat: number; nonce: string };

function secret(): string {
  const value = process.env.QG_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("QG_SESSION_SECRET must be at least 32 characters");
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    sub: "admin",
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string, now = Date.now()): boolean {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return false;
  const expected = Buffer.from(sign(encoded));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return payload.sub === "admin" && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function cookies(req: FastifyRequest): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? "").split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
    })
  );
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.QG_ADMIN_PASSWORD_HASH;
  if (!hash) throw new Error("QG_ADMIN_PASSWORD_HASH is not configured");
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token || !verifySessionToken(token)) {
    return reply.code(401).send({ error: "Authentication required." });
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin) {
      try {
        if (!host || new URL(origin).host !== host) {
          return reply.code(403).send({ error: "Cross-origin request rejected." });
        }
      } catch {
        return reply.code(403).send({ error: "Invalid request origin." });
      }
    }
  }
}

export async function requireCollector(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.QG_INGEST_TOKEN;
  const supplied = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || !supplied) return reply.code(401).send({ error: "Invalid collector credentials." });
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return reply.code(401).send({ error: "Invalid collector credentials." });
  }
}
