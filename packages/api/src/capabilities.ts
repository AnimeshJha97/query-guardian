/**
 * This is the seam between the OSS build and the enterprise package.
 * The dashboard calls GET /api/capabilities on load and hides UI it
 * doesn't have capabilities for (multi-DB switcher, alerting, extended
 * history) rather than the API rejecting requests at the route level.
 *
 * `packages/enterprise` is never imported statically here — only OSS
 * builds ship without it existing at all, so a static import would break
 * `npm install` for OSS users. If present, it's loaded dynamically and
 * merges its capabilities + route plugins in.
 */

export interface Capabilities {
  edition: "oss" | "enterprise";
  multiDatabase: boolean;
  alerting: boolean;
  historyRetentionDays: number;
  sso: boolean;
}

const OSS_CAPABILITIES: Capabilities = {
  edition: "oss",
  multiDatabase: false,
  alerting: false,
  historyRetentionDays: 7,
  sso: false,
};

export async function loadCapabilities(): Promise<Capabilities> {
  try {
    // @ts-expect-error — packages/enterprise is a private package, not
    // present (and not expected to resolve) in OSS checkouts.
    const enterprise = await import("@query-guardian/enterprise");
    return enterprise.capabilities as Capabilities;
  } catch {
    return OSS_CAPABILITIES;
  }
}
