import Fastify from "fastify";
import { loadCapabilities } from "./capabilities.js";
import { runMigrations } from "./db/runMigrations.js";
import { databaseRoutes } from "./routes/databases.js";
import { ingestRoutes } from "./routes/ingest.js";
import { nPlusOneRoutes } from "./routes/nPlusOne.js";
import { queryRoutes } from "./routes/queries.js";
import { suggestionRoutes } from "./routes/suggestions.js";
import { startPatternDetectionJob } from "./jobs/detectPatterns.js";
import { authRoutes } from "./routes/auth.js";

const app = Fastify({ logger: true });

// Schema migrations run automatically on startup (docs/installation.md) —
// a fresh `docker compose up` must work with no manual migrate step.
try {
  await runMigrations();
  app.log.info("database migrations applied");
} catch (err) {
  app.log.error({ err }, "failed to apply database migrations");
  process.exit(1);
}

app.get("/health", async () => ({ status: "ok" }));

// Unauthenticated on purpose — the dashboard needs this before login to
// decide which UI to render.
app.get("/api/capabilities", async () => loadCapabilities());

await app.register(authRoutes, { prefix: "/api" });
await app.register(databaseRoutes, { prefix: "/api" });
await app.register(ingestRoutes, { prefix: "/api" });
await app.register(nPlusOneRoutes, { prefix: "/api" });
await app.register(queryRoutes, { prefix: "/api" });
await app.register(suggestionRoutes, { prefix: "/api" });

const stopPatternDetectionJob = startPatternDetectionJob(app.log);
app.addHook("onClose", async () => {
  stopPatternDetectionJob();
});

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
