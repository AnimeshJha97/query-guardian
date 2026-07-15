import { createReadStream, watchFile, statSync } from "node:fs";
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

  return () => watchFile(filePath, () => {}); // Node has no unwatchFile-by-callback; caller should also call unwatchFile(filePath) if fully tearing down
}

function parseAutoExplainLine(line: string): AutoExplainLogEntry | null {
  // Strip a typical `log_line_prefix` like "2026-07-13 10:00:00 UTC [123]: " if present.
  const jsonStart = line.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    const parsed = JSON.parse(line.slice(jsonStart));
    // auto_explain JSON entries typically nest the plan under "Query Text"/"Plan".
    return {
      timestamp: new Date().toISOString(),
      duration_ms: parsed["Execution Time"] ?? parsed["Plan"]?.["Actual Total Time"] ?? 0,
      query: parsed["Query Text"] ?? "",
      plan: parsed["Plan"] ?? parsed,
      pid: parsed["PID"] ?? null,
      planning_time_ms: parsed["Planning Time"] ?? null,
      execution_time_ms: parsed["Execution Time"] ?? null,
    };
  } catch {
    return null; // partial/multi-line JSON — see module docstring
  }
}
