import { createReadStream, statSync, unwatchFile, watchFile } from "node:fs";
import { createInterface } from "node:readline";
import type { AutoExplainLogEntry } from "@query-guardian/core";

/**
 * Tails a log file containing auto_explain output and emits parsed entries.
 *
 * Requires Postgres configured with:
 *   auto_explain.log_format = 'json'
 *   auto_explain.log_analyze = on
 *   auto_explain.log_min_duration = '200ms'   -- tune per environment
 *   logging_collector = on
 *
 * This is a minimal line-based tailer for the MVP (works for Docker's
 * default log-to-file setup). It assumes one JSON log message per line,
 * which holds when `log_destination` is `jsonlog`, or when a log
 * post-processor has flattened multi-line entries — call that out in the
 * self-hosted setup docs since default `stderr` logging wraps JSON across
 * multiple lines and needs the log_line_prefix stripped first.
 */
export function tailAutoExplainLog(
  filePath: string,
  onEntry: (entry: AutoExplainLogEntry) => void
): () => void {
  let position = 0;
  try {
    position = statSync(filePath).size; // start at end of file, don't replay old history
  } catch {
    // file may not exist yet (e.g. before first slow query); watchFile will pick it up
  }

  const readNewLines = () => {
    const stream = createReadStream(filePath, { start: position, encoding: "utf-8" });
    const rl = createInterface({ input: stream });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      const entry = parseAutoExplainLine(line);
      if (entry) onEntry(entry);
    });

    stream.on("end", () => {
      try {
        position = statSync(filePath).size;
      } catch {
        // ignore — file may have rotated
      }
    });
  };

  watchFile(filePath, { interval: 1000 }, readNewLines);

  return () => unwatchFile(filePath);
}

export function parseAutoExplainLine(line: string): AutoExplainLogEntry | null {
  try {
    const outer = JSON.parse(line.slice(line.indexOf("{")));
    const message = typeof outer.message === "string" ? outer.message : line;
    const objectStart = message.indexOf("{");
    const arrayStart = message.indexOf("[");
    const planStart = [objectStart, arrayStart].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (planStart === undefined) return null;

    const decoded = JSON.parse(message.slice(planStart));
    const parsed = Array.isArray(decoded) ? decoded[0] : decoded;
    const plan = parsed?.Plan ?? parsed;
    return {
      timestamp: toIsoTimestamp(outer.timestamp),
      duration_ms:
        parsed?.["Execution Time"] ?? plan?.["Actual Total Time"] ?? extractDuration(message),
      query: outer.query ?? parsed?.["Query Text"] ?? "",
      plan,
      pid: outer.pid ?? outer.process_id ?? parsed?.PID ?? null,
      planning_time_ms: parsed["Planning Time"] ?? null,
      execution_time_ms: parsed["Execution Time"] ?? null,
      database_name: outer.dbname ?? outer.database_name,
    };
  } catch {
    return null; // partial/multi-line JSON — see module docstring
  }
}

function extractDuration(message: string): number {
  const match = /duration:\s*([\d.]+)\s*ms/i.exec(message);
  return match ? Number(match[1]) : 0;
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}
