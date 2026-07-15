import { afterEach, beforeEach, describe, expect, it } from "vitest";
import argon2 from "argon2";
import Fastify from "fastify";
import { authRoutes } from "../src/routes/auth.js";
import { createSessionToken, verifySessionToken } from "../src/auth.js";

describe("admin authentication", () => {
  beforeEach(async () => {
    process.env.QG_SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars";
    process.env.QG_ADMIN_PASSWORD_HASH = await argon2.hash("correct horse", {
      type: argon2.argon2id,
    });
  });

  afterEach(() => {
    delete process.env.QG_SESSION_SECRET;
    delete process.env.QG_ADMIN_PASSWORD_HASH;
  });

  it("signs expiring session tokens", () => {
    const token = createSessionToken(1_000_000);
    expect(verifySessionToken(token, 1_000_000)).toBe(true);
    expect(verifySessionToken(token, 1_000_000 + 31 * 60_000)).toBe(false);
    expect(verifySessionToken(`${token}tampered`, 1_000_000)).toBe(false);
  });

  it("sets an HttpOnly strict cookie only for a valid password", async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/api" });

    const denied = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "wrong" },
    });
    expect(denied.statusCode).toBe(401);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct horse" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers["set-cookie"]).toContain("HttpOnly");
    expect(accepted.headers["set-cookie"]).toContain("SameSite=Strict");
    await app.close();
  });

  it("rate limits repeated login failures", async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/api" });
    for (let attempt = 0; attempt < 5; attempt++) {
      await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "wrong" } });
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct horse" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    await app.close();
  });
});
