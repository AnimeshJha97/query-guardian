import { createHash } from "node:crypto";

/**
 * Normalizes a SQL query so structurally-identical queries with different
 * literal values collapse to the same fingerprint. This mirrors (loosely)
 * what pg_stat_statements does internally, so fingerprints computed here
 * from auto_explain log lines line up with queryid-based snapshots from
 * direct polling.
 *
 * This is intentionally simple regex-based normalization for the MVP.
 * It is NOT a SQL parser and will mishandle some edge cases (e.g. literals
 * inside string literals). Revisit with a real SQL tokenizer if false
 * fingerprint collisions/splits become a problem in practice.
 */
export function normalizeQuery(rawQuery: string): string {
  let q = rawQuery.trim();

  // Collapse whitespace/newlines.
  q = q.replace(/\s+/g, " ");

  // Replace single-quoted string literals with a placeholder.
  q = q.replace(/'(?:[^']|'')*'/g, "?");

  // Replace numeric literals (integers and decimals) with a placeholder.
  // Avoid touching identifiers like table1, col2.
  q = q.replace(/(?<=[\s(,=<>]|^)-?\d+(\.\d+)?(?=[\s),;]|$)/g, "?");

  // Collapse `IN (?, ?, ?)` lists to a single placeholder marker.
  q = q.replace(/\(\s*(\?\s*,\s*)+\?\s*\)/g, "(?)");

  return q.toLowerCase();
}

export function fingerprintHash(normalizedQuery: string): string {
  return createHash("sha256").update(normalizedQuery).digest("hex").slice(0, 16);
}

export function fingerprintQuery(rawQuery: string): {
  normalizedQuery: string;
  queryHash: string;
} {
  const normalizedQuery = normalizeQuery(rawQuery);
  return { normalizedQuery, queryHash: fingerprintHash(normalizedQuery) };
}
