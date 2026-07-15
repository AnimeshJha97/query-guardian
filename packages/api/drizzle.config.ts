import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.QG_METADATA_DATABASE_URL ?? "postgres://localhost:5432/query_guardian_meta",
  },
});
