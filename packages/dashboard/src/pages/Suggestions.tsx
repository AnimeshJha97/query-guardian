import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDatabases, useQueriesList, useSuggestions, useUpdateSuggestion } from "../lib/hooks";
import { useToast } from "../lib/toast";
import { truncate } from "../lib/format";
import type { Suggestion } from "../lib/types";
import { IconAlert, IconChevronDown, IconEmptyBulb } from "../components/icons";
import {
  Badge,
  PageHeader,
  PrimaryButton,
  Skeleton,
  StatePanel,
  StatusBadge,
  severityFromImpact,
} from "../components/ui";

export function Suggestions() {
  const navigate = useNavigate();
  const suggestionsQ = useSuggestions();
  const queriesQ = useQueriesList();
  const databasesQ = useDatabases();
  const update = useUpdateSuggestion();
  const toast = useToast();
  const [resolvedOpen, setResolvedOpen] = useState(false);

  const all = suggestionsQ.data ?? [];
  const pending = all.filter((s) => s.status === "pending");
  const resolved = all.filter((s) => s.status !== "pending");
  const sqlById = new Map(
    (queriesQ.data ?? []).map((r) => [r.fingerprint.id, r.fingerprint.normalizedQuery])
  );

  const header = (
    <PageHeader
      title="Index suggestions"
      subtitle={`${pending.length} pending · ${resolved.length} resolved`}
    />
  );

  if (suggestionsQ.isLoading) {
    return (
      <div className="max-w-[860px] px-10 pb-16 pt-8">
        {header}
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="mb-3.5 h-[168px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (suggestionsQ.isError) {
    return (
      <div className="max-w-[860px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconAlert />}
          title="Couldn't load suggestions"
          message={(suggestionsQ.error as Error).message}
          action={<PrimaryButton onClick={() => suggestionsQ.refetch()}>Retry</PrimaryButton>}
        />
      </div>
    );
  }

  if (all.length === 0) {
    const noDatabase = (databasesQ.data?.length ?? 0) === 0;
    return (
      <div className="max-w-[860px] px-10 pb-16 pt-8">
        {header}
        <StatePanel
          icon={<IconEmptyBulb />}
          title="No suggestions yet"
          message="Query Guardian analyzes captured EXPLAIN plans for missing-index patterns. Suggestions appear here once enough slow-query traffic has been observed."
          action={
            noDatabase ? (
              <PrimaryButton onClick={() => navigate("/connect")}>Connect a database</PrimaryButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  const copyDdl = async (ddl: string) => {
    try {
      await navigator.clipboard.writeText(ddl);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Couldn't access the clipboard");
    }
  };

  const setStatus = (s: Suggestion, status: "applied" | "dismissed") => {
    update.mutate(
      { id: s.id, status },
      {
        onSuccess: () =>
          toast(status === "applied" ? "Suggestion marked applied" : "Suggestion dismissed",
            status === "applied" ? "success" : "default"),
        onError: (err) => toast(`Update failed: ${(err as Error).message}`),
      }
    );
  };

  const queryLabel = (s: Suggestion) => {
    const sql = sqlById.get(s.fingerprintId);
    return sql ? truncate(sql, 42) : "View query";
  };

  return (
    <div className="max-w-[860px] px-10 pb-16 pt-8">
      {header}

      <div className="flex flex-col gap-3.5">
        {pending.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-xl border border-line bg-elev px-5 py-[18px]"
          >
            <div className="flex items-center justify-between gap-3">
              <Badge level={severityFromImpact(item.estimatedImpact)}>
                {severityFromImpact(item.estimatedImpact)} impact
              </Badge>
              <button
                onClick={() => navigate(`/queries/${item.fingerprintId}`)}
                className="min-w-0 truncate font-mono text-xs font-medium text-accent"
                title="Open query detail"
              >
                {queryLabel(item)} →
              </button>
            </div>
            <div className="text-[13.5px] leading-[1.55] text-ink">{item.reasoning}</div>
            <div className="relative">
              <div className="whitespace-pre-wrap break-words rounded-lg bg-code py-3 pl-3.5 pr-[60px] font-mono text-[12.5px] leading-relaxed text-code-ink">
                {item.suggestedDdl}
              </div>
              <button
                onClick={() => copyDdl(item.suggestedDdl)}
                className="absolute right-[9px] top-[9px] rounded-md border border-strong bg-elev2 px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-ink"
              >
                Copy
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus(item, "applied")}
                disabled={update.isPending}
                className="rounded-[7px] bg-accent px-3.5 py-[7px] text-[12.5px] font-semibold text-accent-on disabled:opacity-50"
                title="Records your decision — Query Guardian never runs DDL against your database"
              >
                Mark applied
              </button>
              <button
                onClick={() => setStatus(item, "dismissed")}
                disabled={update.isPending}
                className="rounded-[7px] border border-strong px-3.5 py-[7px] text-[12.5px] font-medium text-muted disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
        {pending.length === 0 && (
          <div className="rounded-xl border border-line bg-elev px-5 py-4 text-[13px] text-muted">
            Nothing pending — every suggestion has been applied or dismissed.
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <>
          <button
            onClick={() => setResolvedOpen((o) => !o)}
            className="mb-3.5 mt-5 flex select-none items-center gap-2 text-[13px] font-semibold text-muted"
          >
            <span
              className="flex text-faint"
              style={{
                transform: resolvedOpen ? "none" : "rotate(-90deg)",
                transition: "transform 0.12s ease",
              }}
            >
              <IconChevronDown />
            </span>
            <span>Resolved ({resolved.length})</span>
          </button>
          {resolvedOpen && (
            <div className="flex flex-col gap-3.5">
              {resolved.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-elev px-5 py-[18px] opacity-70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge
                      label={item.status === "applied" ? "Applied" : "Dismissed"}
                      good={item.status === "applied"}
                    />
                    <span className="min-w-0 truncate font-mono text-xs text-faint">
                      {queryLabel(item)}
                    </span>
                  </div>
                  <div className="text-[13px] leading-[1.55] text-muted">{item.reasoning}</div>
                  <div className="whitespace-pre-wrap break-words rounded-lg bg-code px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-code-ink opacity-80">
                    {item.suggestedDdl}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
