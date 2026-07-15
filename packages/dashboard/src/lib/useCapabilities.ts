import { useQuery } from "@tanstack/react-query";

export interface Capabilities {
  edition: "oss" | "enterprise";
  multiDatabase: boolean;
  alerting: boolean;
  historyRetentionDays: number;
  sso: boolean;
}

export function useCapabilities() {
  return useQuery<Capabilities>({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const res = await fetch("/api/capabilities");
      return res.json();
    },
    staleTime: Infinity, // capabilities don't change without a restart
  });
}
