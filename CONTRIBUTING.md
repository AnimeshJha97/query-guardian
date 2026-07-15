# Contributing

Use Node.js 20 or newer and install dependencies with `npm ci`. Before opening a pull request, run:

```sh
npm run lint
npm run typecheck
npm test
```

The Playwright suite expects the seeded Docker Compose stack. Start the stack, run `node scripts/seed-workload.mjs`, wait for the collector to ingest a poll cycle, then run `npm run test:e2e`.

## Branch protection

Protect `main` in the GitHub repository settings. Require pull requests and the `quality` and `e2e` CI jobs to pass before merging; block force pushes and branch deletion. The release workflow runs after a merge to `main` and publishes the API, collector, and dashboard images to GHCR with both the full commit SHA and `latest` tags.
