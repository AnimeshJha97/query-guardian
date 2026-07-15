import { suggestIndexesFromPlan } from "@query-guardian/core";
import { indexSuggestions } from "../db/schema.js";
import { db } from "../db/client.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface PersistIndexSuggestionInput {
  databaseId: string;
  fingerprintId: string;
  planJson: unknown;
}

interface PlanLike {
  "Node Type"?: unknown;
  Plan?: unknown;
}

export function extractPlanRoot(planJson: unknown): unknown {
  const first = Array.isArray(planJson) ? planJson[0] : planJson;
  if (!isObject(first)) return null;
  return "Plan" in first ? (first as PlanLike).Plan : first;
}

export async function persistIndexSuggestionsFromPlan(
  tx: Tx,
  input: PersistIndexSuggestionInput
): Promise<number> {
  const root = extractPlanRoot(input.planJson);
  if (!isPlanRoot(root)) return 0;

  const suggestions = suggestIndexesFromPlan(root as Parameters<typeof suggestIndexesFromPlan>[0]);
  if (suggestions.length === 0) return 0;

  const inserted = await tx
    .insert(indexSuggestions)
    .values(
      suggestions.map((suggestion) => ({
        databaseId: input.databaseId,
        fingerprintId: input.fingerprintId,
        suggestedDdl: suggestion.suggestedDdl,
        reasoning: suggestion.reasoning,
        estimatedImpact: suggestion.estimatedImpact,
      }))
    )
    .onConflictDoNothing({
      target: [
        indexSuggestions.databaseId,
        indexSuggestions.fingerprintId,
        indexSuggestions.suggestedDdl,
      ],
    })
    .returning({ id: indexSuggestions.id });

  return inserted.length;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlanRoot(value: unknown): value is { "Node Type": string } {
  return isObject(value) && typeof value["Node Type"] === "string";
}
