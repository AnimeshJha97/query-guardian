# Security Policy

## Supported versions

Security fixes are provided for the latest release on the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private **Report a vulnerability** form in the repository Security tab. Include
the affected version, impact, reproduction steps, and any suggested mitigation.

We will acknowledge a report within 3 business days, provide a status update
within 7 business days, and coordinate disclosure after a fix is available. We
ask reporters to avoid accessing other users' data, disrupting services, or
publishing details before coordinated disclosure.

## Self-hosting security notes

- Configure `QG_ADMIN_PASSWORD_HASH` with an Argon2id hash; never put the plain
  admin password in Compose or source control.
- Configure independent, random values for `QG_SESSION_SECRET` (at least 32
  characters), `QG_INGEST_TOKEN`, and `QG_ENCRYPTION_KEY`.
- Terminate TLS at a trusted reverse proxy. Session cookies are `Secure` in
  production, HttpOnly, SameSite=Strict, and expire after 30 minutes.
- Do not expose the metadata database or collector directly to the internet.
- Treat monitored database DSNs, ingest tokens, and encryption keys as secrets.

The self-hosted edition has one administrator and no password recovery flow.
Rotate a compromised password by generating a new hash and restarting the API;
rotate `QG_SESSION_SECRET` to invalidate all active sessions immediately.
