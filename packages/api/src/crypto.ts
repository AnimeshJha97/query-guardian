import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

const PREFIX = "qg:aes-256-gcm:v1";
const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function decodeKey(value: string): Buffer {
  const trimmed = value.trim();
  const candidates: Buffer[] = [];

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    candidates.push(Buffer.from(trimmed, "hex"));
  }

  candidates.push(Buffer.from(trimmed, "base64url"));
  candidates.push(Buffer.from(trimmed, "base64"));
  candidates.push(Buffer.from(trimmed, "utf8"));

  for (const candidate of candidates) {
    if (candidate.length === KEY_BYTES) return candidate;
  }

  throw new Error(
    "QG_ENCRYPTION_KEY must decode to exactly 32 bytes. Use base64url, base64, hex, or a 32-byte raw string."
  );
}

function getEncryptionKey(): Buffer {
  const value = process.env.QG_ENCRYPTION_KEY;
  if (!value) {
    throw new Error(
      "QG_ENCRYPTION_KEY is not configured. Generate one with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\""
    );
  }

  return decodeKey(value);
}

export function encryptDsn(dsn: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(dsn, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptDsn(encrypted: string): string {
  const [prefixA, prefixB, prefixC, ivPart, tagPart, ciphertextPart] = encrypted.split(":");
  const prefix = [prefixA, prefixB, prefixC].join(":");
  if (prefix !== PREFIX || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Unsupported encrypted DSN format.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
