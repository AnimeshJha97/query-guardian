import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { suggestIndexesFromPlan } from "../src/indexSuggestions";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readExplainFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function planRoot(explainJson: unknown): Parameters<typeof suggestIndexesFromPlan>[0] {
  const first = Array.isArray(explainJson) ? explainJson[0] : explainJson;
  if (!first || typeof first !== "object") throw new Error("fixture is not an EXPLAIN object");
  const root = "Plan" in first ? first.Plan : first;
  if (!root || typeof root !== "object" || !("Node Type" in root)) {
    throw new Error("fixture does not contain a plan root");
  }
  return root as Parameters<typeof suggestIndexesFromPlan>[0];
}

describe("suggestIndexesFromPlan fixtures", () => {
  it("suggests an index for the demo books.published_year sequential scan", () => {
    const suggestions = suggestIndexesFromPlan(
      planRoot(readExplainFixture("seq-scan-books-published-year.json"))
    );

    expect(suggestions).toMatchInlineSnapshot(`
      [
        {
          "estimatedImpact": "low",
          "reasoning": "Sequential scan on "books" with filter "(published_year = 1999)". An index on the filtered column can let Postgres skip rows that don't match instead of scanning the whole table.",
          "suggestedDdl": "CREATE INDEX CONCURRENTLY ON books (published_year);",
        },
      ]
    `);
  });

  it("suggests an order-supporting index for explicit sorts", () => {
    const suggestions = suggestIndexesFromPlan(
      planRoot(readExplainFixture("sort-authors-country-name.json"))
    );

    expect(suggestions).toMatchInlineSnapshot(`
      [
        {
          "estimatedImpact": "medium",
          "reasoning": "Explicit sort on (country, name) with no index providing that order. An index matching the ORDER BY can let Postgres avoid a sort step entirely.",
          "suggestedDdl": "-- CREATE INDEX CONCURRENTLY ON <table> (country, name); -- verify table name from query text",
        },
      ]
    `);
  });

  it("does not suggest anything for an existing index scan", () => {
    const suggestions = suggestIndexesFromPlan(
      planRoot(readExplainFixture("index-scan-books-author-id.json"))
    );

    expect(suggestions).toEqual([]);
  });
});
