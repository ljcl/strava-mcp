# Strava MCP

[![CI](https://github.com/ljcl/strava-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ljcl/strava-mcp/actions/workflows/ci.yml)
[![Storybook](https://img.shields.io/badge/Storybook-live-ff4785?logo=storybook&logoColor=white)](https://ljcl.github.io/strava-mcp/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A Model Context Protocol (MCP) server that connects Large Language Models to your Strava data. Ask natural language questions about your activities, segments, routes, and more.

## Features

- Access recent activities, profile, and stats
- Fetch detailed activity streams (power, heart rate, cadence, etc.)
- Explore, view, star, and manage segments
- View detailed activity and segment effort information
- List and view details of saved routes
- Export routes in GPX or TCX format
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

### 4. Authorize with Strava

Visit `https://your-public-url/auth/start` in your browser. After authorizing, tokens are saved automatically.

Check status anytime at `https://your-public-url/auth/status`.

### 5. Connect to Claude Desktop

Add to your Claude configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "strava": {
      "type": "url",
      "url": "https://your-public-url/mcp"
    }
  }
}
```

Restart Claude Desktop to load the new configuration.

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

Ask your AI assistant questions like these:

**Recent Activity & Profile:**
- "Show me my recent Strava activities"
- "What were my last 3 rides?"
- "Get my Strava profile information"

**Activity Streams & Data:**
- "Get the heart rate data from my morning run yesterday"
- "Show me the power data from my last ride"
- "What was my cadence profile for my weekend century ride?"

**Stats:**
- "What are my running stats for this year on Strava?"
- "How far have I cycled in total?"

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
| `get-recent-activities` | Fetch recent activities |
| `get-all-activities` | Fetch all activities with filtering |
| `get-activity-details` | Get detailed info for a specific activity |
| `update-activity` | Update an activity's description, title, sport type, gear, or flags |
| `get-activity-segment-efforts` | Segment efforts in an activity, with PRs and top-10s highlighted |
| `get-activity-streams` | Get time-series data (HR, power, GPS, etc.) |
| `get-activity-laps` | Get lap data for an activity |
| `get-activity-zones` | Time spent in each HR and power zone for an activity |
| `get-activity-photos` | Get photos from an activity |
| `get-running-summary` | Running-focused summary with HR zones and lap analysis |
| `get-training-load` | Training load summary with trend analysis |
| `compare-activities` | Compare two running activities side-by-side |
| `get-best-efforts` | Personal best efforts across all running activities |

### Athlete Tools

| Tool | Description |
| ---- | ----------- |
| `get-athlete-profile` | Get authenticated athlete's profile |
| `get-athlete-stats` | Get activity statistics (recent, YTD, all-time) |
| `get-athlete-zones` | Get heart rate and power zones |
| `list-gear` | List saved gear (shoes and bikes) with distance and status |
| `list-athlete-clubs` | List clubs the athlete is a member of |

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

## Project Structure

```
apps/server/               MCP server (tools, auth, token management)
apps/storybook/            Storybook for UI development
packages/activity-chart/   Interactive activity chart (MCP App)
packages/cadence-trends/   Cadence trend analysis (MCP App)
packages/route-map/        Activity/route GPS map (MCP App)
packages/data/             Shared pure data utilities
packages/ui/               Shared presentational React components
packages/design-system/    Design tokens, color constants, Storybook preview
packages/vite-config/      Shared Vite config for MCP App builds
packages/tsconfig/         Shared TypeScript configurations
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

## License

MIT
