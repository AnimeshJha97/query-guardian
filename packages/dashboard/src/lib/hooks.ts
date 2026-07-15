import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "./api";
import type {
  ExplainResponse,
  ConnectionMode,
  MonitoredDatabase,
  NPlusOnePattern,
  PreflightResponse,
  QueryDetailResponse,
  QueryListRow,
  SslMode,
  Suggestion,
  SuggestionStatus,
} from "./types";

const POLL_MS = 30_000; // matches the collector's default poll interval

/**
 * GET /api/queries. The API's left join can emit one row per snapshot for
 * the same fingerprint, so dedupe client-side keeping the latest snapshot.
 */
export function useQueriesList() {
  return useQuery<QueryListRow[]>({
    queryKey: ["queries"],
    queryFn: () => apiFetch("/queries"),
    refetchInterval: POLL_MS,
    select: (rows) => {
      const byId = new Map<string, QueryListRow>();
      for (const row of rows) {
        const existing = byId.get(row.fingerprint.id);
        if (
          !existing ||
          (row.latestSnapshot &&
            (!existing.latestSnapshot ||
              row.latestSnapshot.collectedAt > existing.latestSnapshot.collectedAt))
        ) {
          byId.set(row.fingerprint.id, row);
        }
      }
      return [...byId.values()];
    },
  });
}

export function useQueryDetail(id: string | undefined) {
  return useQuery<QueryDetailResponse>({
    queryKey: ["queries", id],
    queryFn: () => apiFetch(`/queries/${id}`),
    enabled: !!id,
  });
}

/** 404 means "no plan captured yet" — surface that as data, not an error. */
export function useExplainPlan(id: string | undefined) {
  return useQuery<ExplainResponse | null>({
    queryKey: ["queries", id, "explain"],
    queryFn: async () => {
      try {
        return await apiFetch<ExplainResponse>(`/queries/${id}/explain`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!id,
    retry: false,
  });
}

export function useSuggestions() {
  return useQuery<Suggestion[]>({
    queryKey: ["suggestions"],
    queryFn: () => apiFetch("/suggestions"),
    refetchInterval: POLL_MS,
  });
}

export function useUpdateSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SuggestionStatus }) =>
      apiFetch<Suggestion>(`/suggestions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
  });
}

export interface NPlusOneResult {
  /** false while GET /api/n-plus-one isn't implemented (sprint-plan Sprint 2). */
  available: boolean;
  items: NPlusOnePattern[];
}

export function useNPlusOne() {
  return useQuery<NPlusOneResult>({
    queryKey: ["n-plus-one"],
    queryFn: async () => {
      try {
        const items = await apiFetch<NPlusOnePattern[]>("/n-plus-one");
        return { available: true, items };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { available: false, items: [] };
        }
        throw err;
      }
    },
    refetchInterval: POLL_MS,
    retry: false,
  });
}

export function useDatabases() {
  return useQuery<MonitoredDatabase[]>({
    queryKey: ["databases"],
    queryFn: () => apiFetch("/databases"),
    refetchInterval: POLL_MS,
  });
}

export function useCreateDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      dsn: string;
      connectionMode: ConnectionMode;
      sslMode: SslMode;
    }) =>
      apiFetch<MonitoredDatabase>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["databases"] }),
  });
}

export function usePreflight() {
  return useMutation<PreflightResponse, Error, { dsn: string; sslMode: SslMode }>({
    mutationFn: ({ dsn, sslMode }) =>
      apiFetch<PreflightResponse>("/databases/preflight", {
        method: "POST",
        body: JSON.stringify({ dsn, sslMode }),
      }),
  });
}
