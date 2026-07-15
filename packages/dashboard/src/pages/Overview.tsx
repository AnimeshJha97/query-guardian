import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useDatabases, useNPlusOne, useQueriesList, useSuggestions } from "../lib/hooks";
import { fmtMs, fmtNum, fmtWindow, truncate } from "../lib/format";
import type { QueryDetailResponse, QueryListRow } from "../lib/types";
import { IconAlert, IconEmptyDb } from "../components/icons";
import {
  Badge,
  PageHeader,
  PrimaryButton,
  Skeleton,
  Sparkline,
  StatePanel,
  severityFromCount,
  severityFromImpact,
} from "../components/ui";

const PAGE = "mx-auto w-full max-w-[1180px] px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-8";

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-elev p-[18px]">
      <div className="mb-2.5 text-xs font-medium text-muted">{label}</div>
      <div
        className={`text-[28px] font-semibold tracking-[-0.01em] ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function Overview() {
  const navigate = useNavigate();
  const queriesQ = useQueriesList();
  const suggestionsQ = useSuggestions();
  const n1Q = useNPlusOne();
  const databasesQ = useDatabases();

  const rows = queriesQ.data ?? [];
  const top5: QueryListRow[] = [...rows]
    .sort(
      (a, b) => (b.latestSnapshot?.totalExecTimeMs ?? -1) - (a.latestSnapshot?.totalExecTimeMs ?? -1)
    )
    .slice(0, 5);

  // Per-query snapshot history for the trend sparklines (top 5 only).
  const sparkQueries = useQueries({
    queries: top5.map((row) => ({
      queryKey: ["queries", row.fingerprint.id],
      queryFn: () => apiFetch<QueryDetailResponse>(`/queries/${row.fingerprint.id}`),
      staleTime: 30_000,
    })),
  });
  const sparkByFingerprint = new Map<string, number[]>();
  sparkQueries.forEach((q, i) => {
    if (q.data && top5[i]) {
      const series = [...q.data.snapshots]
        .reverse() // API returns newest-first
        .slice(-20)
        .map((s) => s.meanExecTimeMs);
      sparkByFingerprint.set(top5[i].fingerprint.id, series);
    }
  });

  if (queriesQ.isLoading || databasesQ.isLoading) {
    return (
      <div className={PAGE}>
        <PageHeader title="Overview" subtitle="Is anything on fire right now?" />
        <div className="mb-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
        <Skeleton className="mb-5 h-[220px]" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[220px]" />
        </div>
      </div>
    );
  }

  if (queriesQ.isError) {
    return (
      <div className={PAGE}>
        <PageHeader title="Overview" subtitle="Is anything on fire right now?" />
        <StatePanel
          icon={<IconAlert />}
          title="Couldn't load dashboard data"
          message={(queriesQ.error as Error).message}
          action={<PrimaryButton onClick={() => queriesQ.refetch()}>Retry now</PrimaryButton>}
        />
      </div>
    );
  }

  const noDatabase = (databasesQ.data?.length ?? 0) === 0;
  if (rows.length === 0) {
    return (
      <div className={PAGE}>
        <PageHeader title="Overview" subtitle="Is anything on fire right now?" />
        <StatePanel
          icon={<IconEmptyDb />}
          title={noDatabase ? "No database connected yet" : "No queries captured yet"}
          message={
            noDatabase
              ? "Connect a Postgres instance to start tracking query performance, N+1 patterns, and index suggestions."
              : "The collector samples pg_stat_statements every 30s. Give it a poll cycle, or run some traffic against the monitored database."
          }
          action={
            noDatabase ? (
              <PrimaryButton onClick={() => navigate("/connect")}>Connect a database</PrimaryButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  const suggestions = suggestionsQ.data ?? [];
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const n1Items = n1Q.data?.items ?? [];
  const openN1 = n1Items.filter((p) => p.status === "open");
  const slowCount = rows.filter((r) => (r.latestSnapshot?.meanExecTimeMs ?? 0) > 500).length;
  const sqlById = new Map(rows.map((r) => [r.fingerprint.id, r.fingerprint.normalizedQuery]));

  return (
    <div className={PAGE}>
      <PageHeader title="Overview" subtitle="Is anything on fire right now?" />

      <div className="mb-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Queries tracked" value={fmtNum(rows.length)} />
        <StatCard
          label="Open N+1 patterns"
          value={n1Q.data?.available === false ? "—" : String(openN1.length)}
        />
        <StatCard label="Pending index suggestions" value={String(pendingSuggestions.length)} />
        <StatCard label="Queries >500ms mean" value={String(slowCount)} accent={slowCount > 0} />
      </div>

      <div className="mb-8">
        <div className="mb-3 text-sm font-semibold">Top 5 slowest queries</div>
        <div className="overflow-x-auto rounded-[10px] border border-line bg-elev">
          <div className="min-w-[680px]">
          <div className="flex items-center border-b border-line px-[18px] py-[9px] text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
            <div className="min-w-0 flex-1 pr-3">Query</div>
            <div className="w-24 text-right">Calls</div>
            <div className="w-24 text-right">Mean</div>
            <div className="flex w-20 justify-end">Trend</div>
          </div>
          {top5.map((row) => (
            <div
              key={row.fingerprint.id}
              onClick={() => navigate(`/queries/${row.fingerprint.id}`)}
              className="flex cursor-pointer items-center border-b border-line px-[18px] py-[13px] last:border-b-0 hover:bg-wash"
            >
              <div className="min-w-0 flex-1 pr-3">
                <span
                  className="block truncate font-mono text-[12.5px] text-ink"
                  title={row.fingerprint.normalizedQuery}
                >
                  {truncate(row.fingerprint.normalizedQuery, 64)}
                </span>
              </div>
              <div className="w-24 text-right text-[13px] font-medium text-muted">
                {row.latestSnapshot ? fmtNum(row.latestSnapshot.calls) : "—"}
              </div>
              <div className="w-24 text-right text-[13px] font-medium text-muted">
                {row.latestSnapshot ? fmtMs(row.latestSnapshot.meanExecTimeMs) : "—"}
              </div>
              <div className="flex w-20 justify-end">
                <Sparkline values={sparkByFingerprint.get(row.fingerprint.id) ?? []} />
              </div>
            </div>
          ))}
          </div>
        </div>
        <button
          onClick={() => navigate("/queries")}
          className="mt-2.5 text-[12.5px] font-medium text-accent"
        >
          View all queries →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Recent N+1 patterns</div>
            <button
              onClick={() => navigate("/n-plus-one")}
              className="text-[12.5px] font-medium text-accent"
            >
              View all →
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {n1Q.data?.available === false ? (
              <div className="rounded-[9px] border border-line bg-elev px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                N+1 detection isn't wired up in this build yet (sprint-plan Sprint 2). Detected
                patterns will appear here once the pipeline lands.
              </div>
            ) : n1Items.length === 0 ? (
              <div className="rounded-[9px] border border-line bg-elev px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                Nothing suspicious so far.
              </div>
            ) : (
              n1Items.slice(0, 3).map((item) => {
                const firstFp = item.fingerprintIds[0];
                const sql = firstFp ? sqlById.get(firstFp) : undefined;
                return (
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
                        {item.occurrencesInWindow}× in {fmtWindow(item.windowSeconds)}
                      </span>
                    </div>
                    {sql && (
                      <div className="truncate font-mono text-[12.5px] text-ink">
                        {truncate(sql, 60)}
                      </div>
                    )}
                    <div className="text-[12.5px] leading-relaxed text-muted">
                      Repeated {item.occurrencesInWindow} times in a short window — likely a missing
                      eager-load.
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Recent index suggestions</div>
            <button
              onClick={() => navigate("/suggestions")}
              className="text-[12.5px] font-medium text-accent"
            >
              View all →
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {pendingSuggestions.length === 0 ? (
              <div className="rounded-[9px] border border-line bg-elev px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                No pending suggestions.
              </div>
            ) : (
              pendingSuggestions.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate("/suggestions")}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-[9px] border border-line bg-elev px-3.5 py-3 hover:bg-wash"
                >
                  <div className="flex items-center gap-2">
                    <Badge level={severityFromImpact(item.estimatedImpact)}>
                      {severityFromImpact(item.estimatedImpact)}
                    </Badge>
                    <span className="truncate text-[11.5px] text-faint">
                      on {truncate(sqlById.get(item.fingerprintId) ?? "query", 40)}
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-muted">{item.reasoning}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
