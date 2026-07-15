import { describe, expect, it } from "vitest";
import { parseAutoExplainLine } from "../src/logTail";

describe("parseAutoExplainLine", () => {
  it("parses Postgres jsonlog auto_explain records", () => {
    const line = JSON.stringify({
      timestamp: "2026-07-15T10:00:00.000Z",
      pid: 42,
      dbname: "appdb",
      message:
        'duration: 3.25 ms  plan:\n[{"Query Text":"SELECT * FROM books WHERE author_id = $1","Plan":{"Node Type":"Seq Scan","Relation Name":"books","Actual Total Time":3.25},"Execution Time":3.25}]',
    });

    expect(parseAutoExplainLine(line)).toMatchObject({
      timestamp: "2026-07-15T10:00:00.000Z",
      duration_ms: 3.25,
      query: "SELECT * FROM books WHERE author_id = $1",
      pid: 42,
      database_name: "appdb",
      plan: { "Node Type": "Seq Scan", "Relation Name": "books" },
    });
  });

  it("ignores unrelated structured log records", () => {
    expect(parseAutoExplainLine(JSON.stringify({ message: "database system is ready" }))).toBeNull();
  });
});
