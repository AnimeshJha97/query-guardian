import { db } from "./client.js";
import { organizations } from "./schema.js";

type DbExecutor = Pick<typeof db, "select" | "insert">;

/** Self-hosted is single-tenant: fetch (or lazily create) the one org row. */
export async function getDefaultOrgId(executor: DbExecutor = db): Promise<string> {
  const [existing] = await executor.select().from(organizations).limit(1);
  if (existing) return existing.id;
  const [created] = await executor.insert(organizations).values({ name: "Default" }).returning();
  return created.id;
}
