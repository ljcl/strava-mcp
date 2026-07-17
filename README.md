# Strava MCP

[![CI](https://github.com/ljcl/strava-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ljcl/strava-mcp/actions/workflows/ci.yml)
[![Storybook](https://img.shields.io/badge/Storybook-live-ff4785?logo=storybook&logoColor=white)](https://ljcl.github.io/strava-mcp/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A Model Context Protocol (MCP) server that supplements the official Strava MCP connector. It adds write access, segments, routes, photos, derived analysis, and interactive visualizations that the official connector does not provide.

## Features

- Write and update activities (title, description, sport type, gear, flags)
- Explore, view, star, and manage segments
- Fetch per-activity photos, zone breakdowns, and running summaries
- List and view details of saved routes
- Export routes (GPX/TCX) and activity tracks (GPX built from streams)
- AI-friendly JSON responses via MCP
- Interactive activity charts (heart rate, power, altitude, pace) rendered in MCP-compatible hosts
- Automatic token refresh
- Streamable HTTP transport for remote deployment

Browse the UI components in the [live Storybook](https://ljcl.github.io/strava-mcp/).

## Quick Start (Docker)

### 1. Create a Strava API Application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application:
   - Enter your application details (name, website, description)
   - Set "Authorization Callback Domain" to your public URL hostname (e.g., `strava-mcp.example.com`)
   - Note your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
PUBLIC_URL=https://your-public-url.example.com
```

### 3. Start the Server

```bash
docker compose up -d
```

> **Prefer a prebuilt image?** Instead of building locally you can pull the published image:
>
> ```bash
> docker pull ghcr.io/ljcl/strava-mcp:latest
> ```
>
> Point your `docker-compose.yml` `image:` at `ghcr.io/ljcl/strava-mcp:latest` (and drop the
> `build:` block) to run it without a local build.

> **Note on the `./data` bind mount:** the image is distroless and runs as the non-root user
> **UID 65534**. Tokens are persisted to the host-mounted `./data` directory, so it must be
> writable by that UID or token persistence fails on first run:
>
> ```bash
> mkdir -p data
> sudo chown -R 65534:65534 data
> ```
>
> Alternatively, swap the bind mount for a named volume in `docker-compose.yml`
> (e.g. `strava-data:/app/data`), which Docker initializes with the correct ownership.

### 4. Authorize with Strava

Visit `https://your-public-url/auth/start` in your browser. After authorizing, tokens are saved automatically.

Check status anytime at `https://your-public-url/auth/status`.

If you set `MCP_AUTH_TOKEN` (recommended for tunnel-exposed servers — see
[Securing the endpoint](#securing-the-endpoint)), append it to both URLs as
`?token=<MCP_AUTH_TOKEN>`.

### 5. Connect to Claude Desktop

Add to your Claude configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "strava": {
      "type": "url",
      "url": "https://your-public-url/mcp",
      "headers": { "Authorization": "Bearer your-mcp-auth-token" }
    }
  }
}
```

The `headers` entry is only needed when `MCP_AUTH_TOKEN` is set (recommended
for tunnel-exposed servers — see [Securing the endpoint](#securing-the-endpoint)).

Restart Claude Desktop to load the new configuration.

Using a different MCP client? See [Client configuration](#client-configuration) for Claude Code, Cursor, and VS Code.

## Connecting to AI Tools

Most AI tools (Claude Desktop, Claude Code, etc.) need an HTTPS URL to reach your MCP server. Since the server runs on your local network, you'll need a tunnel to expose it.

### Tailscale Funnel (Recommended)

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) exposes a local port to the internet over HTTPS with no configuration:

```bash
tailscale funnel --bg 3000
# → https://your-machine.tail1234.ts.net
```

Set `PUBLIC_URL` in your `.env` to the resulting URL.

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

### Securing the endpoint

A tunnel makes `/mcp` reachable by anyone who discovers the URL — including the
`update-activity` write tool. Set `MCP_AUTH_TOKEN` to a long random secret
(e.g. `openssl rand -hex 32`) and the server requires
`Authorization: Bearer <token>` on every `/mcp` request, returning 401
otherwise. Each client snippet below shows where the header goes. Without
`MCP_AUTH_TOKEN` the endpoint stays open (unchanged behaviour) and the server
logs a startup warning when `PUBLIC_URL` is configured.

The secret also gates the OAuth web routes: `/auth/start` and `/auth/status`
require it (in the browser, open `/auth/start?token=<MCP_AUTH_TOKEN>`), so a
stranger cannot start an authorization flow against your server or read your
athlete id and token expiry. `/auth/callback` stays open for Strava's
redirect but only accepts callbacks carrying the single-use `state` nonce
minted by your own `/auth/start`, so it cannot be used to overwrite your
stored tokens with someone else's account.

### Architecture

```text
AI Tool (Claude Desktop, Claude Code, etc.)
    │  HTTPS
HTTPS Tunnel (Tailscale / Cloudflare)
    │  HTTP (localhost:3000)
Strava MCP Server (Docker / Bun)
    │  HTTPS
Strava API
```

### Client configuration

The server works with any MCP client that supports the Streamable HTTP transport. In every
snippet below, replace `https://your-public-url` with your tunnel URL (or `http://localhost:3000`
for local development), and include the `Authorization` header only if you set `MCP_AUTH_TOKEN`.

#### Claude Code

```bash
claude mcp add --transport http strava https://your-public-url/mcp \
  --header "Authorization: Bearer your-mcp-auth-token"
```

#### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "strava": {
      "url": "https://your-public-url/mcp",
      "headers": { "Authorization": "Bearer your-mcp-auth-token" }
    }
  }
}
```

#### VS Code

Add to `.vscode/mcp.json` in your workspace (or run **MCP: Add Server** from the command palette):

```json
{
  "servers": {
    "strava": {
      "type": "http",
      "url": "https://your-public-url/mcp",
      "headers": { "Authorization": "Bearer your-mcp-auth-token" }
    }
  }
}
```

#### Other clients (generic Streamable HTTP)

Any client that speaks [Streamable HTTP](https://modelcontextprotocol.io/docs/concepts/transports)
can connect to the `/mcp` endpoint directly:

- POST JSON-RPC messages to `https://your-public-url/mcp` with an
  `Accept: application/json, text/event-stream` header.
- If `MCP_AUTH_TOKEN` is set, also send `Authorization: Bearer <token>`
  on every request.
- The `initialize` response includes an `Mcp-Session-Id` header; echo it on every
  subsequent request in the same session.

## Using alongside the official Strava MCP

Strava's official MCP connector handles activity discovery and basic reads. This server supplements it with everything the official connector does not offer: writing to activities, segments, routes and GPX/TCX export, photos, derived analysis, and interactive visualizations.

### Install both

- Official: `claude mcp add --transport http strava-mcp https://mcp.strava.com/mcp` (or via claude.ai Connectors / Claude Desktop).
- This server: see the install steps above.

### Who does what

| Capability | Official | This server |
| ---------- | -------- | ----------- |
| List / read activities, streams, profile, zones, gear, clubs, training plan | yes | no (use official) |
| Update activities, star segments | no | yes |
| Segment detail / search / efforts | no | yes |
| Routes plus GPX/TCX export | no | yes |
| Activity GPX export (synthesized from streams) | no | yes |
| Activity photos | no | yes |
| Athlete stats, per-activity zones, best efforts, running summary, training load, compare | no | yes |
| Interactive chart / cadence / route-map / activity-segments apps | no | yes |

### Caveats

- The official connector requires a Strava subscription and currently runs only in Anthropic clients.
- With the duplicate reads removed, this server now effectively assumes the official connector is installed for activity discovery. The aggregate analysis tools (`get-best-efforts`, `get-training-load`) fetch their own activity lists, but per-activity tools (`get-running-summary`, `compare-activities`, `get-activity-zones`, etc.) need an activity id from the official `list_activities`.
- The two use separate rate-limit quotas, so running both spreads API load.

### Recommended workflow

Use the official connector to discover and read activities, then use this server to write, explore segments, manage and export routes, and visualize. The model can pass activity ids from official `list_activities` directly into this server's tools.

## Local Development

For running without Docker or Tailscale Funnel:

### Prerequisites

- [Bun](https://bun.sh/) runtime
- A Strava Account

### Setup

```bash
bun install

# Run the setup script for localhost-based OAuth
cd apps/server
bun run setup-auth

# Start the development server (server + MCP App watchers)
cd ../..
bun run dev
```

The setup script will guide you through the OAuth flow using `localhost` as the redirect URI.

### Configure Claude Desktop (Local)

```json
{
  "mcpServers": {
    "strava": {
      "type": "url",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Environment Variables

| Variable               | Required | Description                                                |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `STRAVA_CLIENT_ID`     | Yes      | Your Strava Application Client ID                          |
| `STRAVA_CLIENT_SECRET` | Yes      | Your Strava Application Client Secret                      |
| `PUBLIC_URL`           | Yes*     | Public URL for OAuth callback (required for web auth)      |
| `STRAVA_ACCESS_TOKEN`  | No       | Initial access token (from `bun run setup-auth`)                  |
| `STRAVA_REFRESH_TOKEN` | No       | Initial refresh token (from `bun run setup-auth`)                 |
| `MCP_AUTH_TOKEN`       | No       | Shared secret; when set, `/mcp` requires `Authorization: Bearer <token>` |
| `ROUTE_EXPORT_PATH`    | No       | Absolute path for saving exported route files              |
| `TOKEN_DATA_DIR`       | No       | Override token storage directory (default: `./data`)       |
| `PORT`                 | No       | Server port (default: `3000`)                              |

*Required for Docker/web-based OAuth. Not needed when using `bun run setup-auth` locally.

## Token Handling

The server implements automatic token management:

- **On startup**: Checks token validity and refreshes if expired
- **During operation**: Automatically refreshes on 401 errors
- **Persistence**: Tokens are saved to `data/tokens.json` (survives container restarts)
- **Re-authorization**: Visit `/auth/start` anytime to re-authorize

You only need to authorize once **per scope set**. The refresh token obtains new access tokens automatically, but it cannot add scopes that were not granted originally.

### Re-authorizing after a scope change

When the server gains a tool that needs a new OAuth scope (for example `activity:write` for editing activities), you must do a fresh authorization to mint a token that carries it. The automatic refresh keeps the old scopes.

- Local: `cd apps/server && bun run setup-auth`
- Web / Docker: visit `/auth/start` on your server

Both flows use `approval_prompt=force`, so Strava re-prompts and issues a token with the current scope set.

## Rate Limits & Resilience

The HTTP layer (`apps/server/src/fetchClient.ts`) handles Strava's rate limits and transient failures centrally, so every tool benefits without per-tool code:

- **Rate-limit awareness**: Every response's `X-RateLimit-*` / `X-ReadRateLimit-*` (15-minute and daily windows) and `Retry-After` headers are parsed. Strava allows 100 requests / 15 min and 1000 / day by default ([docs](https://developers.strava.com/docs/rate-limits/)).
- **429 backoff**: On a rate-limit response the client honours `Retry-After` and retries (bounded, so a tool call never blocks on a full 15-minute window). When the limit is genuinely exhausted the model gets a structured message naming which window is gone and when it resets.
- **Transient retry**: `5xx` (500/502/503/504) and network faults are retried with bounded exponential backoff. Only idempotent reads (`GET`) are retried; writes (`update-activity`, `star-segment`) are never blindly retried.

This is passive — there's nothing to configure.

## Natural Language Examples

Ask your AI assistant questions like these (use the official Strava MCP to discover activity IDs, then pass them to these tools):

**Activity Writing:**
- "Update the title of activity 12345678 to 'Morning Threshold'"
- "Add a note to my last ride: 'Felt strong on the climbs'"

**Analysis and Visualization:**
- "Show me the HR zone breakdown for activity 12345678"
- "Compare my two long runs from last week"
- "What are my best 5K and mile efforts?"
- "Show me the cadence trends for my last 10 runs"
- "View the route map for my last ride"
- "Show me the segments from this morning's run"

**Stats:**
- "What are my running stats for this year on Strava?"

**Segments:**
- "List the segments I starred near Boulder, Colorado"
- "Get details for the 'Alpe du Zwift' segment"
- "Star the 'Flagstaff Road Climb' segment for me"

**Routes:**
- "List my saved Strava routes"
- "Export my 'Boulder Loop' route as a GPX file"

## API Reference

The server exposes the following MCP tools:

### Activity Tools

| Tool | Description |
| ---- | ----------- |
| `create-activity` | Create a manual activity (no device recording), e.g. strength or yoga |
| `update-activity` | Update an activity's description, title, sport type, gear, or flags |
| `get-activity-zones` | Time spent in each HR and power zone for an activity |
| `get-activity-laps` | Laps of an activity with sport-aware pace/speed, HR, power, cadence |
| `export-activity-gpx` | Export an activity's recorded track as GPX built from its streams |
| `get-activity-photos` | Get photos from an activity |
| `get-running-summary` | Running-focused summary with HR zones and lap analysis |
| `get-aerobic-analysis` | Aerobic decoupling, efficiency factor, and intensity factor from HR + power/speed streams |
| `get-hill-analysis` | Climb/descent detection with GAP and early-vs-late climb effort drift |
| `get-interval-analysis` | Interval detection with urban-stop-aware rest classification and rep fade |
| `get-training-load` | Training load summary with trend analysis |
| `get-fitness-trend` | Fitness/fatigue/form (CTL/ATL/TSB) from relative effort, with rest projection |
| `compare-activities` | Compare two running activities side-by-side |
| `get-best-efforts` | Personal best efforts across all running activities |

### Athlete Tools

| Tool | Description |
| ---- | ----------- |
| `get-athlete-stats` | Get activity statistics (recent, YTD, all-time) |

### Segment Tools

| Tool | Description |
| ---- | ----------- |
| `list-starred-segments` | List starred segments |
| `get-segment` | Get detailed segment info |
| `explore-segments` | Search for segments in a geographic area |
| `star-segment` | Star or unstar a segment |
| `get-segment-effort` | Get details for a specific segment effort |
| `list-segment-efforts` | List athlete's efforts on a segment |

### Route Tools

| Tool | Description |
| ---- | ----------- |
| `list-athlete-routes` | List created routes |
| `get-route` | Get detailed route info |
| `export-route-gpx` | Export route as GPX file |
| `export-route-tcx` | Export route as TCX file |

### Visualization Tools

| Tool | Description |
| ---- | ----------- |
| `view-activity-chart` | Interactive chart with HR, power, pace, altitude overlays (MCP App) |
| `get-activity-streams-raw` | Raw stream data for the activity chart UI (app-only) |
| `view-cadence-trends` | Interactive cadence trends with timeline, scatter, zones, and overlay views (MCP App) |
| `get-cadence-trend-data` | Summary cadence/pace data for the cadence trends UI (app-only) |
| `view-route-map` | Interactive map of an activity or route GPS track, fit to bounds with start/finish markers (MCP App) |
| `get-route-map-data` | Decoded `[lat, lng]` coordinates for the route map UI (app-only) |
| `view-activity-segments` | Prioritised, scrollable list of one activity's segment efforts: PRs/top-10 pinned, then run order, pace-heat with expandable effort detail (MCP App) |
| `get-activity-segments-data` | Segment-effort rows (time, pace, grade, ranks, HR/power/cadence) for the activity-segments UI (app-only) |
| `view-compare-activities` | Interactive overlay of two activities' streams on a shared distance/time axis with a delta summary (MCP App) |
| `get-compare-activities-data` | Aggregate comparison (summaries, differences, efficiency) for the compare-activities UI (app-only) |

## Project Structure

```
apps/server/                 MCP server (tools, auth, token management)
apps/storybook/              Storybook for UI development
packages/activity-chart/     Interactive activity chart (MCP App)
packages/cadence-trends/     Cadence trend analysis (MCP App)
packages/route-map/          Activity/route GPS map (MCP App)
packages/activity-segments/  Activity segment-effort list (MCP App)
packages/compare-activities/ Two-activity stream overlay (MCP App)
packages/data/               Shared pure data utilities
packages/ui/                 Shared presentational React components
packages/design-system/      Design tokens, color constants, Storybook preview
packages/vite-config/        Shared Vite config for MCP App builds
packages/tsconfig/           Shared TypeScript configurations
```

## Development

Bun workspaces with Turborepo. All tasks are cached and run in parallel where possible.

```bash
bun run check             # Full verification: lint + test + typecheck + build + boundaries
bun run check:affected    # Same, only packages changed since main
bun run build             # Build all packages
bun run test              # Run all tests
bun run lint              # Lint (Biome)
bun run lint:fix          # Auto-fix lint issues
bun run knip              # Dead code / unused export analysis
bun run boundaries        # Package boundary enforcement
bun run dev               # Dev mode (server + MCP App watchers)

# Storybook
cd apps/storybook
bun run storybook         # Storybook on port 6006
```

### Storybook and visual review

The UI packages are developed in Storybook (`apps/storybook`). The `main` build is published to GitHub Pages and to Chromatic. Every pull request that changes a UI package is published to Chromatic, which adds two checks to the PR: a link to that branch's hosted Storybook and a visual diff against `main`. Reviewers can see UI changes without checking out the branch.

Storybook also exposes a Model Context Protocol server (via `@storybook/addon-mcp`) so AI tools can read component docs and stories. Endpoints are pre-wired in `.mcp.json`: a local one at `http://localhost:6006/mcp` (while Storybook is running) and the hosted `main` build at `https://main--6a261929a3cb4ac107f3c06d.chromatic.com/mcp`.

See `CLAUDE.md` for the full architecture reference, styling guide, Turborepo details, and MCP App patterns.

### Commits and releases

PRs are squash-merged, so the **PR title becomes the commit on `main`**. Write it as a
[Conventional Commit](https://www.conventionalcommits.org/):

- `feat: ...` — minor version bump
- `fix: ...` — patch version bump
- `feat!: ...` or a `BREAKING CHANGE:` footer — major version bump
- `chore: ` / `docs: ` / `refactor: ` / `ci: ` — no release

A CI check (`pr-title.yml`) rejects non-conforming PR titles. Versioning, the changelog,
and image publishing are automated by release-please; a non-conventional title means no
release is cut.

## Troubleshooting

**AI tool can't reach the server** — MCP requires an HTTPS URL. Use a tunnel (Tailscale Funnel or Cloudflare Tunnel) to expose your local server. See [Connecting to AI Tools](#connecting-to-ai-tools).

**OAuth callback fails** — Ensure `PUBLIC_URL` in your `.env` matches the tunnel URL exactly, and that the same hostname is set as the "Authorization Callback Domain" in your [Strava API settings](https://www.strava.com/settings/api).

**Token errors or expired tokens** — Visit `/auth/start` on your server to re-authorize. Tokens are refreshed automatically, but a full re-auth may be needed if the refresh token has been revoked.

**Tokens don't survive a container restart (Docker)** — The container runs as non-root UID 65534, so the `./data` bind mount must be writable by that UID (`sudo chown -R 65534:65534 data`) or use a named volume instead. See [Quick Start step 3](#3-start-the-server).

## License

MIT
