import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDatabases, useQueriesList } from "../lib/hooks";
import { fmtMs, fmtNum, timeAgo, truncate } from "../lib/format";
import {
  IconAlert,
  IconChevronDown,
  IconEmptyList,
  IconEmptySearch,
  IconSearch,
} from "../components/icons";
import { PageHeader, PrimaryButton, Skeleton, StatePanel } from "../components/ui";

type SortCol = "calls" | "totalMs" | "meanMs";

const SORT_LABEL: Record<SortCol, string> = {
  calls: "calls",
  totalMs: "total time",
  meanMs: "mean time",
};

export function Queries() {
  const navigate = useNavigate();
  const queriesQ = useQueriesList();
  const databasesQ = useDatabases();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({
    col: "totalMs",
    dir: "desc",
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = queriesQ.data ?? [];
    const filtered = search.trim()
      ? all.filter((r) =>
          r.fingerprint.normalizedQuery.toLowerCase().includes(search.trim().toLowerCase())
        )
      : all;
    const value = (r: (typeof filtered)[number]) => {
      const s = r.latestSnapshot;
      if (!s) return -1;
      return sort.col === "calls" ? s.calls : sort.col === "meanMs" ? s.meanExecTimeMs : s.totalExecTimeMs;
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => (value(a) - value(b)) * dir);
  }, [queriesQ.data, search, sort]);

  const toggleSort = (col: SortCol) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));
  const arrow = (col: SortCol) => (sort.col === col ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  const header = (
    <PageHeader
      title="Queries"
      subtitle={`${rows.length} normalized queries · sorted by ${SORT_LABEL[sort.col]}`}
    />
  );

  const searchBox = (
    <div className="mb-[18px]">
      <div className="relative max-w-[380px]">
        <span className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-faint">
          <IconSearch />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search normalized queries…"
          className="w-full rounded-[7px] border border-line bg-elev py-2 pl-8 pr-3 text-[13px] text-ink"
        />
      </div>
    </div>
  );

  if (queriesQ.isLoading) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        {searchBox}
        <div className="overflow-hidden rounded-[10px] border border-line bg-elev">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-[46px] rounded-none border-b border-line last:border-b-0" />
          ))}
        </div>
      </div>
    );
  }

  if (queriesQ.isError) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconAlert />}
          title="Couldn't load query stats"
          message={(queriesQ.error as Error).message}
          action={<PrimaryButton onClick={() => queriesQ.refetch()}>Retry</PrimaryButton>}
        />
      </div>
    );
  }

  const hasAny = (queriesQ.data?.length ?? 0) > 0;
  const noDatabase = (databasesQ.data?.length ?? 0) === 0;

  if (!hasAny) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconEmptyList />}
          title="No queries captured yet"
          message="Once connected, Query Guardian samples pg_stat_statements every 30s. Give it a minute after connecting."
          action={
            noDatabase ? (
              <PrimaryButton onClick={() => navigate("/connect")}>Connect a database</PrimaryButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        {searchBox}
        <StatePanel
          icon={<IconEmptySearch />}
          title={`No queries match "${search}"`}
          message="Try a different term, or clear the filter to see everything."
          action={<PrimaryButton onClick={() => setSearch("")}>Clear search</PrimaryButton>}
        />
      </div>
    );
  }

  const sortableCol =
    "w-[88px] shrink-0 cursor-pointer select-none whitespace-nowrap text-right text-[13px] font-medium text-muted";

  return (
    <div className="max-w-[1180px] px-10 pb-16 pt-8">
      {header}
      {searchBox}
      <div className="overflow-hidden rounded-[10px] border border-line bg-elev">
        <div className="flex items-center gap-1 whitespace-nowrap border-b border-line px-[18px] py-[9px] text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
          <div className="min-w-[140px] flex-[3_1_200px] pr-3">Query</div>
          <div className={sortableCol} onClick={() => toggleSort("calls")}>
            Calls{arrow("calls")}
          </div>
          <div className={sortableCol} onClick={() => toggleSort("totalMs")}>
            Total{arrow("totalMs")}
          </div>
          <div className={sortableCol} onClick={() => toggleSort("meanMs")}>
            Mean{arrow("meanMs")}
          </div>
          <div className="w-[88px] shrink-0 whitespace-nowrap text-right text-[13px] text-muted">
            Last seen
          </div>
        </div>
        {rows.map((row) => {
          const isExpanded = expanded === row.fingerprint.id;
          return (
            <div key={row.fingerprint.id}>
              <div
                onClick={() => navigate(`/queries/${row.fingerprint.id}`)}
                className="flex cursor-pointer items-center gap-1 border-b border-line px-[18px] py-3 hover:bg-wash"
              >
                <div className="flex min-w-[140px] flex-[3_1_200px] items-center gap-2 pr-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(isExpanded ? null : row.fingerprint.id);
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-faint"
                    style={{
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.12s ease",
                    }}
                    title={isExpanded ? "Collapse" : "Expand full query"}
                  >
                    <IconChevronDown />
                  </button>
                  <span
                    className="block min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink"
                    title={row.fingerprint.normalizedQuery}
                  >
                    {truncate(row.fingerprint.normalizedQuery, 78)}
                  </span>
                </div>
                <div className="w-[88px] shrink-0 text-right text-[13px] font-medium text-muted">
                  {row.latestSnapshot ? fmtNum(row.latestSnapshot.calls) : "—"}
                </div>
                <div className="w-[88px] shrink-0 text-right text-[13px] font-medium text-muted">
                  {row.latestSnapshot ? fmtMs(row.latestSnapshot.totalExecTimeMs) : "—"}
                </div>
                <div className="w-[88px] shrink-0 text-right text-[13px] font-medium text-muted">
                  {row.latestSnapshot ? fmtMs(row.latestSnapshot.meanExecTimeMs) : "—"}
                </div>
                <div className="w-[88px] shrink-0 whitespace-nowrap text-right text-[13px] text-muted">
                  {timeAgo(row.fingerprint.lastSeenAt)}
                </div>
              </div>
              {isExpanded && (
                <div className="whitespace-pre-wrap break-words border-b border-line bg-code px-[18px] py-3.5 font-mono text-[12.5px] leading-relaxed text-code-ink">
                  {row.fingerprint.normalizedQuery}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
