#!/usr/bin/env node
// Generates synthetic traffic against the demo database so the dashboard
// has real signal on first run: a deliberate N+1 (one query per author to
// fetch their books, instead of a single JOIN) plus a slow sequential scan.
//
// Usage: QG_TARGET_DATABASE_URL=postgres://... node scripts/seed-workload.mjs

import pg from "pg";

const connectionString =
  process.env.QG_TARGET_DATABASE_URL ??
  "postgres://query_guardian_reader:qg_reader_dev_password@localhost:5432/appdb";

const pool = new pg.Pool({ connectionString, max: 5 });

async function runNPlusOne() {
  const { rows: authors } = await pool.query("SELECT id FROM authors LIMIT 50");
  for (const author of authors) {
    // Classic ORM lazy-load pattern: one query per parent row.
    await pool.query("SELECT * FROM books WHERE author_id = $1", [author.id]);
  }
}

async function runSlowSeqScan() {
  // No index on published_year — forces a sequential scan over 20k rows.
  await pool.query("SELECT * FROM books WHERE published_year = 1999");
}

async function main() {
  console.log("Running synthetic workload against the demo database...");
  for (let i = 0; i < 5; i++) {
    await runNPlusOne();
    await runSlowSeqScan();
    console.log(`  batch ${i + 1}/5 complete`);
  }
  console.log("Done. Give the collector one poll cycle (default 30s), then check the dashboard.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
