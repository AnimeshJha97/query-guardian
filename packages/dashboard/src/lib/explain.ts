/**
 * Parses raw Postgres EXPLAIN (FORMAT JSON) output — as captured by
 * auto_explain and stored in explain_plans.plan_json — into a tree the
 * plan viewer can render. Handles both ANALYZE plans (actual rows/times)
 * and plan-only output (estimates/costs only).
 */

export interface ExplainNode {
  id: string;
  label: string;
  rowsEst: number | null;
  rowsActual: number | null;
  timeMs: number | null;
  /** Share of the root node's total (actual time when available, else cost). */
  pct: number | null;
  detail: string | null;
  children: ExplainNode[];
}

interface RawPlanNode {
  [key: string]: unknown;
  Plans?: RawPlanNode[];
}

const DETAIL_KEYS = [
  "Hash Cond",
  "Index Cond",
  "Recheck Cond",
  "Merge Cond",
  "Join Filter",
  "Filter",
  "Sort Key",
  "Group Key",
] as const;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function nodeLabel(raw: RawPlanNode): string {
  const type = str(raw["Node Type"]) ?? "Unknown";
  const relation = str(raw["Relation Name"]);
  const index = str(raw["Index Name"]);
  const alias = str(raw["Alias"]);
  let label = type;
  if (index) label += ` using ${index}`;
  if (relation) {
    label += ` on ${relation}`;
    if (alias && alias !== relation) label += ` ${alias}`;
  }
  return label;
}

function nodeDetail(raw: RawPlanNode): string | null {
  const parts: string[] = [];
  for (const key of DETAIL_KEYS) {
    const v = raw[key];
    if (typeof v === "string") parts.push(`${key}: ${v}`);
    else if (Array.isArray(v)) parts.push(`${key}: ${v.join(", ")}`);
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

/** Locate the root plan node inside whatever shape planJson arrived in. */
function findRootPlan(planJson: unknown): RawPlanNode | null {
  let root: unknown = planJson;
  if (Array.isArray(root)) root = root[0];
  if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    if (obj["Plan"] && typeof obj["Plan"] === "object") return obj["Plan"] as RawPlanNode;
    if (obj["Node Type"]) return obj as RawPlanNode;
  }
  return null;
}

export function parseExplain(planJson: unknown): ExplainNode[] {
  const rootRaw = findRootPlan(planJson);
  if (!rootRaw) return [];

  // pct denominator: prefer actual time (ANALYZE), fall back to cost.
  const rootTime = num(rootRaw["Actual Total Time"]);
  const rootCost = num(rootRaw["Total Cost"]);

  const walk = (raw: RawPlanNode, id: string): ExplainNode => {
    const timeMs = num(raw["Actual Total Time"]);
    const cost = num(raw["Total Cost"]);
    let pct: number | null = null;
    if (rootTime && timeMs !== null) pct = Math.round((timeMs / rootTime) * 100);
    else if (rootCost && cost !== null) pct = Math.round((cost / rootCost) * 100);

    const children = Array.isArray(raw.Plans)
      ? raw.Plans.map((child, i) => walk(child, `${id}.${i}`))
      : [];

    return {
      id,
      label: nodeLabel(raw),
      rowsEst: num(raw["Plan Rows"]),
      rowsActual: num(raw["Actual Rows"]),
      timeMs,
      pct,
      detail: nodeDetail(raw),
      children,
    };
  };

  return [walk(rootRaw, "0")];
}

export interface FlatExplainRow extends Omit<ExplainNode, "children"> {
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  expensive: boolean;
}

/** Flattens the tree for rendering, skipping children of collapsed nodes. */
export function flattenExplain(
  nodes: ExplainNode[],
  collapsed: Record<string, boolean>
): FlatExplainRow[] {
  const out: FlatExplainRow[] = [];
  const walk = (node: ExplainNode, depth: number) => {
    const isCollapsed = !!collapsed[node.id];
    out.push({
      id: node.id,
      label: node.label,
      rowsEst: node.rowsEst,
      rowsActual: node.rowsActual,
      timeMs: node.timeMs,
      pct: node.pct,
      detail: node.detail,
      depth,
      hasChildren: node.children.length > 0,
      collapsed: isCollapsed,
      expensive: node.pct !== null && node.pct >= 30,
    });
    if (!isCollapsed) node.children.forEach((c) => walk(c, depth + 1));
  };
  nodes.forEach((n) => walk(n, 0));
  return out;
}
