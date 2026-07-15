import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useExplainPlan, useNPlusOne, useQueryDetail, useSuggestions } from "../lib/hooks";
import { flattenExplain, parseExplain } from "../lib/explain";
import { fmtMs, fmtMsInt, fmtNum, fmtWindow, timeAgo } from "../lib/format";
import type { StatsSnapshot } from "../lib/types";
import { IconAlert, IconBack, IconChevronDown, IconEmptyPlan } from "../components/icons";
import {
  Badge,
  PrimaryButton,
  Skeleton,
  Sql,
  StatePanel,
  severityFromCount,
  severityFromImpact,
} from "../components/ui";

type Metric = "time" | "calls";

const PAGE = "mx-auto w-full max-w-[1180px] px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-8";

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-[92px] flex-col gap-[3px]">
      <span className="text-[11.5px] font-medium text-faint">{label}</span>
      <span className={`text-[17px] font-semibold ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[5px] px-2.5 py-[5px] text-xs font-medium ${
        active ? "bg-elev text-ink shadow-[0_1px_2px_rgba(0,0,0,0.15)]" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

interface ChartPoint {
  timestamp: string;
  label: string;
  value: number;
}

function TimeSeriesTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ChartPoint; value: number }>;
  metric: Metric;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-[7px] border border-strong bg-elev2 px-2.5 py-[7px] shadow-card">
      <div className="mb-[2px] text-[10.5px] text-faint">
        {new Date(point.timestamp).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="text-[13px] font-semibold text-ink">
        {metric === "time" ? fmtMs(point.value) : `${fmtNum(point.value)} calls`}
      </div>
    </div>
  );
}

function TimeSeriesChart({ snapshots, metric }: { snapshots: StatsSnapshot[]; metric: Metric }) {
  const points = useMemo(
    () =>
      [...snapshots].reverse().map((s) => ({
        timestamp: s.collectedAt,
        label: new Date(s.collectedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        value: metric === "time" ? s.meanExecTimeMs : s.calls,
      })),
    [snapshots, metric]
  );

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-line bg-elev px-6 py-10 text-center text-[13px] text-muted">
        Not enough samples to chart yet - the collector adds one point per poll cycle.
      </div>
    );
  }

  const fmtAxis = (v: string | number) =>
    metric === "time" ? fmtMsInt(Number(v)) : fmtNum(Math.round(Number(v)));

  return (
    <div className="h-[260px] rounded-xl border border-line bg-elev px-2 pb-2 pt-[18px] sm:px-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 12, bottom: 8, left: 4 }}>
          <defs>
            <linearGradient id="query-detail-trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            width={48}
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtAxis}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
            content={(props) => (
              <TimeSeriesTooltip
                active={props.active}
                payload={
                  props.payload as unknown as
                    | ReadonlyArray<{ payload: ChartPoint; value: number }>
                    | undefined
                }
                metric={metric}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="value"
            fill="url(#query-detail-trend)"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--bg-elev)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QueryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detailQ = useQueryDetail(id);
  const explainQ = useExplainPlan(id);
  const suggestionsQ = useSuggestions();
  const n1Q = useNPlusOne();
  const [metric, setMetric] = useState<Metric>("time");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const back = (
    <button
      onClick={() => navigate("/queries")}
      className="mb-[18px] flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
    >
      <IconBack />
      Queries
    </button>
  );

  if (detailQ.isLoading) {
    return (
      <div className={PAGE}>
        {back}
        <Skeleton className="mb-5 h-[140px] rounded-xl" />
        <Skeleton className="mb-5 h-[260px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <div className={PAGE}>
        {back}
        <StatePanel
          icon={<IconAlert />}
          title="Couldn't load this query"
          message={detailQ.error ? (detailQ.error as Error).message : "Query not found."}
          action={<PrimaryButton onClick={() => detailQ.refetch()}>Retry</PrimaryButton>}
        />
      </div>
    );
  }

  const { fingerprint, snapshots } = detailQ.data;
  const latest = snapshots[0] ?? null;
  const explainNodes =
    explainQ.data?.plan != null ? parseExplain(explainQ.data.plan.planJson) : [];
  const explainRows = flattenExplain(explainNodes, collapsed);
  const relatedSuggestions = (suggestionsQ.data ?? []).filter((s) => s.fingerprintId === id);
  const relatedN1 = (n1Q.data?.items ?? []).filter((p) => p.fingerprintIds.includes(id ?? ""));
  const hasRelated = relatedSuggestions.length > 0 || relatedN1.length > 0;
  const twoRelatedColumns = relatedSuggestions.length > 0 && relatedN1.length > 0;

  return (
    <div className={PAGE}>
      {back}

      <div className="mb-5 rounded-xl border border-line bg-elev px-5 py-5 sm:px-[22px]">
        <div className="mb-[18px] break-words rounded-lg bg-code px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-code-ink">
          <Sql sql={fingerprint.normalizedQuery} />
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-4">
          <Chip label="Calls" value={latest ? fmtNum(latest.calls) : "-"} />
          <Chip label="Mean time" value={latest ? fmtMs(latest.meanExecTimeMs) : "-"} accent />
          <Chip label="Total time" value={latest ? fmtMs(latest.totalExecTimeMs) : "-"} />
          <Chip label="Last seen" value={timeAgo(fingerprint.lastSeenAt)} />
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Execution over time</div>
          <div className="flex gap-0.5 rounded-[7px] bg-wash p-0.5">
            <SegButton active={metric === "time"} onClick={() => setMetric("time")}>
              Mean time
            </SegButton>
            <SegButton active={metric === "calls"} onClick={() => setMetric("calls")}>
              Calls
            </SegButton>
          </div>
        </div>
        <TimeSeriesChart snapshots={snapshots} metric={metric} />
      </div>

      <div className="mb-8">
        <div className="mb-3 text-sm font-semibold">Query plan</div>
        {explainQ.isLoading ? (
          <Skeleton className="h-[220px] rounded-xl" />
        ) : explainQ.isError ? (
          <StatePanel
            icon={<IconAlert />}
            title="Couldn't load the EXPLAIN plan"
            message={(explainQ.error as Error).message}
            action={<PrimaryButton onClick={() => explainQ.refetch()}>Retry</PrimaryButton>}
          />
        ) : explainQ.data == null || explainRows.length === 0 ? (
          <StatePanel
            icon={<IconEmptyPlan />}
            title="No EXPLAIN plan captured yet"
            message="Plans come from auto_explain when this query runs slower than the configured threshold. Query Guardian captures one the next time that happens."
          />
        ) : (
          <>
            <div className="mb-2 text-[12px] text-faint">
              captured {timeAgo(explainQ.data.event.occurredAt)} |{" "}
              {fmtMs(explainQ.data.event.durationMs)} | {explainQ.data.event.source}
              {explainQ.data.plan?.planningTimeMs != null &&
                ` | planning ${fmtMs(explainQ.data.plan.planningTimeMs)}`}
              {explainQ.data.plan?.executionTimeMs != null &&
                ` | execution ${fmtMs(explainQ.data.plan.executionTimeMs)}`}
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-elev">
              {explainRows.map((row, i) => (
                <div
                  key={row.id}
                  onClick={() =>
                    row.hasChildren && setCollapsed((c) => ({ ...c, [row.id]: !c[row.id] }))
                  }
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-[11px] ${
                    i < explainRows.length - 1 ? "border-b border-line" : ""
                  } ${row.hasChildren ? "cursor-pointer hover:bg-wash" : ""}`}
                  style={{
                    paddingLeft: 16 + row.depth * 22,
                    borderLeft: row.expensive
                      ? "2px solid var(--warning)"
                      : "2px solid transparent",
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {row.hasChildren && (
                      <span
                        className="flex shrink-0 text-faint"
                        style={{
                          transform: row.collapsed ? "rotate(-90deg)" : "none",
                          transition: "transform 0.12s ease",
                        }}
                      >
                        <IconChevronDown size={9} />
                      </span>
                    )}
                    <span className="min-w-0 font-mono text-[12.5px] text-ink">{row.label}</span>
                    {row.expensive && row.pct !== null && (
                      <span className="shrink-0 rounded-[5px] bg-warning-soft px-1.5 py-[1px] text-[10.5px] font-semibold text-warning">
                        {row.pct}% of total
                      </span>
                    )}
                    {row.detail && (
                      <span className="min-w-[140px] truncate text-[11.5px] text-faint">
                        {row.detail}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-[11.5px] text-faint">
                      rows est {row.rowsEst !== null ? fmtNum(row.rowsEst) : "-"} / act{" "}
                      {row.rowsActual !== null ? fmtNum(row.rowsActual) : "-"}
                    </span>
                    <span
                      className={`min-w-[48px] text-right text-[12.5px] font-semibold ${
                        row.expensive ? "text-warning" : "text-muted"
                      }`}
                    >
                      {row.timeMs !== null ? fmtMs(row.timeMs) : "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {hasRelated && (
        <div className={`grid gap-5 ${twoRelatedColumns ? "xl:grid-cols-2" : ""}`}>
          {relatedSuggestions.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-semibold">Related index suggestions</div>
              <div className="flex flex-col gap-2.5">
                {relatedSuggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate("/suggestions")}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-[9px] border border-line bg-elev px-3.5 py-3 hover:bg-wash"
                  >
                    <div className="flex items-center gap-2">
                      <Badge level={severityFromImpact(item.estimatedImpact)}>
                        {severityFromImpact(item.estimatedImpact)}
                      </Badge>
                    </div>
                    <div className="text-[12.5px] leading-relaxed text-muted">{item.reasoning}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {relatedN1.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-semibold">Related N+1 patterns</div>
              <div className="flex flex-col gap-2.5">
                {relatedN1.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate("/n-plus-one")}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-[9px] border border-line bg-elev px-3.5 py-3 hover:bg-wash"
                  >
                    <div className="flex items-center gap-2">
                      <Badge level={severityFromCount(item.occurrencesInWindow)}>
                        {severityFromCount(item.occurrencesInWindow)}
                      </Badge>
                      <span className="text-[11.5px] text-faint">
                        {item.occurrencesInWindow}x in {fmtWindow(item.windowSeconds)}
                      </span>
                    </div>
                    <div className="text-[12.5px] leading-relaxed text-muted">
                      Detected {timeAgo(item.detectedAt)}.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
