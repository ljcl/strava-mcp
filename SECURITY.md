# Security Policy

strava-mcp is an OAuth server: it handles a Strava client secret and persists
athlete tokens to disk. Vulnerabilities in that surface are worth reporting
privately.

## Supported versions

Only the latest release receives security fixes. Older tags and the
corresponding `ghcr.io/ljcl/strava-mcp` images are not patched — upgrade to the
newest version before reporting an issue you can only reproduce on an old one.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

- Preferred: [report a vulnerability privately via GitHub](https://github.com/ljcl/strava-mcp/security/advisories/new)
  (Security tab → "Report a vulnerability").
- Fallback: email <luke@lukeclark.com.au> with "strava-mcp security" in the
  subject.

Include what you can: affected version or image tag, reproduction steps, and
impact. You can expect an acknowledgement within 7 days and a fix or a
mitigation plan within 30 days for confirmed issues. This is a spare-time
project, so those are targets rather than guarantees.

## Scope

In scope:

- The MCP server (`apps/server`): OAuth flow, token storage and refresh,
  `/mcp` transport, tool handlers that call the Strava API.
- The published Docker image (`ghcr.io/ljcl/strava-mcp`).
- The MCP App bundles served as resources (`ui://.../app.html`).

Out of scope:

- The Strava API itself — report Strava platform issues to Strava.
- Vulnerabilities that require an already-compromised host or a
  misconfigured deployment (for example, exposing the server publicly without
  the documented reverse proxy / tunnel).
- Denial of service via the Strava rate limits.

## Token and secret handling

- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` are supplied via environment
  variables only; they are never written to disk by the server.
- Athlete tokens are persisted to `data/tokens.json`. That file is sensitive:
  it is gitignored and must never be committed, and the `./data` bind mount
  should not be world-readable.
- The container runs as the non-root user UID 65534 on a distroless base, so
  `data/` must be writable by that UID (see the README's Docker notes).

If you find tokens or secrets leaking anywhere outside these paths (logs,
error messages, MCP tool output), that is a vulnerability — please report it.
