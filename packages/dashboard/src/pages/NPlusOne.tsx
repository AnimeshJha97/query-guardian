import { useNavigate } from "react-router-dom";
import { useDatabases, useNPlusOne, useQueriesList } from "../lib/hooks";
import { fmtTimestamp, fmtWindow, truncate } from "../lib/format";
import { IconAlert, IconEmptyN1 } from "../components/icons";
import {
  Badge,
  PageHeader,
  PrimaryButton,
  Skeleton,
  StatePanel,
  StatusBadge,
  severityFromCount,
} from "../components/ui";

export function NPlusOne() {
  const navigate = useNavigate();
  const n1Q = useNPlusOne();
  const queriesQ = useQueriesList();
  const databasesQ = useDatabases();

  const items = n1Q.data?.items ?? [];
  const open = items.filter((p) => p.status === "open");
  const resolved = items.filter((p) => p.status === "resolved");
  const sqlById = new Map(
    (queriesQ.data ?? []).map((r) => [r.fingerprint.id, r.fingerprint.normalizedQuery])
  );

  const header = (
    <PageHeader
      title="N+1 patterns"
      subtitle={
        n1Q.data?.available === false
          ? "detection pipeline not yet available"
          : `${open.length} open · ${resolved.length} resolved`
      }
    />
  );

  if (n1Q.isLoading) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[158px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (n1Q.isError) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconAlert />}
          title="Couldn't load pattern detections"
          message={(n1Q.error as Error).message}
          action={<PrimaryButton onClick={() => n1Q.refetch()}>Retry</PrimaryButton>}
        />
      </div>
    );
  }

  if (n1Q.data?.available === false) {
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconEmptyN1 />}
          title="N+1 detection isn't wired up yet"
          message="The detection engine exists in packages/core, but the API endpoint (GET /api/n-plus-one) ships with Sprint 2 of the sprint plan. This page lights up automatically once that lands."
        />
      </div>
    );
  }

  if (items.length === 0) {
    const noDatabase = (databasesQ.data?.length ?? 0) === 0;
    return (
      <div className="max-w-[1180px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconEmptyN1 />}
          title="No N+1 patterns detected"
          message="Query Guardian watches for the same query firing repeatedly within a short window. Nothing suspicious so far."
          action={
            noDatabase ? (
              <PrimaryButton onClick={() => navigate("/connect")}>Connect a database</PrimaryButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] px-10 pb-16 pt-8">
      {header}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}
      >
        {items.map((item) => {
          const severity = severityFromCount(item.occurrencesInWindow);
          const firstFp = item.fingerprintIds[0];
          const sql = firstFp ? sqlById.get(firstFp) : undefined;
          return (
            <div
              key={item.id}
              className="rounded-xl border border-line bg-elev px-[18px] py-4"
              style={{ opacity: item.status === "open" ? 1 : 0.72 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <Badge level={severity}>{severity}</Badge>
                <StatusBadge
                  label={item.status === "open" ? "Open" : "Resolved"}
                  good={item.status === "resolved"}
                />
              </div>
              {sql ? (
                <button
                  onClick={() => firstFp && navigate(`/queries/${firstFp}`)}
                  className="mb-3.5 block w-full truncate text-left font-mono text-xs text-ink hover:text-accent"
                  title={sql}
                >
                  {truncate(sql, 56)}
                </button>
              ) : (
                <div className="mb-3.5 font-mono text-xs text-faint">
                  {item.fingerprintIds.length} fingerprint(s)
                </div>
              )}
              <div className="mb-3 text-[12.5px] font-semibold text-ink">
                {item.occurrencesInWindow}× in {fmtWindow(item.windowSeconds)}
              </div>
              <div className="flex justify-between text-[11.5px] text-faint">
                <span>Detected: {fmtTimestamp(item.detectedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
