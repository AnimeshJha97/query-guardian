# @query-guardian/enterprise (private)

This package is **not part of the open-source repository**. It's documented
here so the interface boundary is explicit, not because it ships.

`packages/api/src/capabilities.ts` attempts a dynamic `import("@query-guardian/enterprise")`
and falls back to OSS capabilities if the package isn't installed — so the
OSS build never fails to resolve it, and this directory can safely be
`.gitignore`'d or removed from public checkouts entirely.

## What it provides (when present)

```ts
// packages/enterprise/src/index.ts (illustrative — not implemented here)
export const capabilities = {
  edition: "enterprise",
  multiDatabase: true,
  alerting: true,
  historyRetentionDays: 90,
  sso: true,
};

export function registerEnterpriseRoutes(app: FastifyInstance) {
  // alerting rules CRUD, SSO callback routes, org management, etc.
}
```

## What it replaces from the OSS build

- `auth.ts`'s single-admin `requireAdmin` → SSO/JWT-based multi-user auth
- `capabilities.ts`'s OSS defaults → enterprise capability set
- Single default org (`getDefaultOrgId` in `routes/databases.ts`) → full org/tenant management
- No alerting → `alerts` / `alert_events` tables (already in the shared schema) become active

See architecture doc section 1 for the full package boundary rationale.
