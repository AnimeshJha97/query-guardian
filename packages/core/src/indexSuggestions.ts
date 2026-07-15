import type { SuggestionImpact } from "./types.js";

// Minimal shape of a Postgres EXPLAIN (FORMAT JSON) plan node.
// Real plans have many more fields; we only read what the rules below need.
interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Alias"?: string;
  "Filter"?: string;
  "Index Cond"?: string;
  "Sort Key"?: string[];
  "Actual Rows"?: number;
  "Plan Rows"?: number;
  "Actual Loops"?: number;
  Plans?: PlanNode[];
}

export interface RawSuggestion {
  reasoning: string;
  suggestedDdl: string;
  estimatedImpact: SuggestionImpact;
}

/** Walks a plan tree, calling `visit` on every node. */
function walk(node: PlanNode, visit: (n: PlanNode) => void) {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
}

/**
 * Rule-based index suggestions from a single EXPLAIN plan.
 * v1 rules — deliberately simple, each rule is independent and cheap.
 * Extend by adding more rules; keep each rule single-purpose so
 * `reasoning` stays easy to explain to a user.
 */
export function suggestIndexesFromPlan(root: PlanNode): RawSuggestion[] {
  const suggestions: RawSuggestion[] = [];

  walk(root, (node) => {
    // Rule 1: sequential scan with a filter that discards most rows,
    // scanned enough times to matter.
    if (
      node["Node Type"] === "Seq Scan" &&
      node["Filter"] &&
      (node["Actual Rows"] ?? 0) >= 0 &&
      (node["Plan Rows"] ?? 0) > 0
    ) {
      const relation = node["Relation Name"] ?? node["Alias"] ?? "the table";
      const filterCol = extractFirstColumn(node["Filter"]);
      const loops = node["Actual Loops"] ?? 1;
      const impact: SuggestionImpact = loops > 100 ? "high" : loops > 10 ? "medium" : "low";
      suggestions.push({
        reasoning: `Sequential scan on "${relation}" with filter "${node["Filter"]}"` +
          (loops > 1 ? ` executed ${loops} times.` : ".") +
          ` An index on the filtered column can let Postgres skip rows that don't match instead of scanning the whole table.`,
        suggestedDdl: filterCol
          ? `CREATE INDEX CONCURRENTLY ON ${relation} (${filterCol});`
          : `-- Could not auto-derive a column; inspect Filter: "${node["Filter"]}" on ${relation}`,
        estimatedImpact: impact,
      });
    }

    // Rule 2: explicit sort with no supporting index (a Sort node whose
    // child isn't an Index Scan already providing that order).
    if (node["Node Type"] === "Sort" && node["Sort Key"]?.length) {
      const child = node.Plans?.[0];
      const childIsIndexOrdered = child?.["Node Type"]?.includes("Index");
      if (!childIsIndexOrdered) {
        const cols = node["Sort Key"].join(", ");
        suggestions.push({
          reasoning: `Explicit sort on (${cols}) with no index providing that order. ` +
            `An index matching the ORDER BY can let Postgres avoid a sort step entirely.`,
          suggestedDdl: `-- CREATE INDEX CONCURRENTLY ON <table> (${cols}); -- verify table name from query text`,
          estimatedImpact: "medium",
        });
      }
    }
  });

  return suggestions;
}

/** Best-effort extraction of a column name from a simple Filter expression. */
function extractFirstColumn(filter: string): string | null {
  const match = filter.match(/\(?([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|<|>|<=|>=|<>|LIKE)/i);
  return match ? match[1] : null;
}
