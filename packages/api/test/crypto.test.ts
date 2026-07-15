import { describe, expect, it } from "vitest";
import { decryptDsn, encryptDsn } from "../src/crypto";

describe("DSN encryption", () => {
  it("encrypts and decrypts with AES-256-GCM", () => {
    process.env.QG_ENCRYPTION_KEY = "dev-only-32-byte-query-guardian!";
    const dsn = "postgres://query_guardian_reader:secret@example.com:5432/app";

    const encrypted = encryptDsn(dsn);

    expect(encrypted).toMatch(/^qg:aes-256-gcm:v1:/);
    expect(encrypted).not.toContain(dsn);
    expect(decryptDsn(encrypted)).toBe(dsn);
  });
});
