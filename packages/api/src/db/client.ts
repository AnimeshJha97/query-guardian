import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.QG_METADATA_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "QG_METADATA_DATABASE_URL is not set. This is Query Guardian's own metadata " +
      "store, separate from any database you're monitoring."
  );
}

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
