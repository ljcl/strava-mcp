# Strava MCP Server

Remote MCP server for connecting AI tools to your Strava data.

## Architecture

- **Runtime**: Bun (TypeScript)
- **Transport**: Streamable HTTP on port 3000 (`/mcp` endpoint)
- **Deployment**: Docker container, exposed via HTTPS tunnel or reverse proxy
- **Monorepo**: Bun workspaces with Turborepo (`apps/*` + `packages/*`)

## Key Directories

- `apps/server/` — MCP server (tools, auth, token management)
- `packages/activity-chart/` — React + Recharts MCP App for interactive activity charts
- `packages/design-system/` — Shared design tokens and color constants
- `packages/tsconfig/` — Shared TypeScript configurations
- `scripts/setup-auth.ts` — Local OAuth setup script (localhost-based)
- `docs/plans/` — Design docs and implementation plans

## MCP Tools

### Activity Tools

| Tool | Description |
| ---- | ----------- |
| `get-recent-activities` | Fetch recent activities |
| `get-all-activities` | Fetch all activities with filtering by date/type |
| `get-activity-details` | Detailed info for a specific activity |
| `get-activity-streams` | Time-series data (HR, power, GPS, altitude, etc.) |
| `get-activity-laps` | Lap data for an activity |
| `get-activity-photos` | Photos from an activity |
| `get-running-summary` | Running-focused summary with HR zones and lap analysis |
| `get-training-load` | Training load summary with trend analysis |
| `compare-activities` | Compare two running activities side-by-side |
| `get-best-efforts` | Personal best efforts across all running activities |

### Athlete Tools

| Tool | Description |
| ---- | ----------- |
| `get-athlete-profile` | Authenticated athlete's profile |
| `get-athlete-stats` | Activity statistics (recent, YTD, all-time) |
| `get-athlete-zones` | Heart rate and power zones |
| `list-athlete-clubs` | Clubs the athlete is a member of |

### Segment Tools

| Tool | Description |
| ---- | ----------- |
| `list-starred-segments` | List starred segments |
| `get-segment` | Detailed segment info |
| `explore-segments` | Search for segments in a geographic area |
| `star-segment` | Star or unstar a segment |
| `get-segment-effort` | Details for a specific segment effort |
| `list-segment-efforts` | Athlete's efforts on a segment |

### Route Tools

| Tool | Description |
| ---- | ----------- |
| `list-athlete-routes` | List created routes |
| `get-route` | Detailed route info |
| `export-route-gpx` | Export route as GPX file |
| `export-route-tcx` | Export route as TCX file |

### Visualization Tools

| Tool | Description |
| ---- | ----------- |
| `view-activity-chart` | Interactive chart with HR, power, pace, altitude overlays (MCP App) |
| `get-activity-streams-raw` | Raw stream data for the activity chart UI (app-only) |

## MCP App (Activity Chart)

https://modelcontextprotocol.io/docs/extensions/apps

The `view-activity-chart` tool renders an interactive Recharts chart in MCP-compatible hosts.

- Uses `@modelcontextprotocol/ext-apps` SDK with React hooks (`useApp`, `useHostStyles`)
- Bundled as single HTML file via `vite-plugin-singlefile`
- Served as MCP resource at `ui://activity-chart/app.html`
- Calls `get-activity-streams-raw` (app-only visibility) to fetch data after render
- Supports heart rate, power, pace, altitude, cadence, and grade overlays

## Commands

```bash
bun install          # Install all deps (workspace-aware)
bun run build        # Build all packages (via Turborepo)
bun run test         # Run all tests (via Turborepo)
bun run lint         # Lint all packages (Biome)
bun run lint:fix     # Auto-fix lint issues
bun run dev          # Dev mode (via Turborepo)

# Server only
cd apps/server
bun run start        # Start server
bun run dev          # Watch mode
bun run test         # Run server tests (Vitest)
bun run test:watch   # Watch mode

# UI development
cd packages/activity-chart
bun run storybook    # Storybook on port 6006
INPUT=app.html bunx vite build  # Rebuild single-file HTML

# Docker
docker compose build
docker compose up -d
docker compose logs -f
```

## Testing the MCP endpoint

```bash
# Health check
curl http://localhost:3000/health

# Initialize session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}}'
```

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `STRAVA_CLIENT_ID` | Yes | Strava Application Client ID |
| `STRAVA_CLIENT_SECRET` | Yes | Strava Application Client Secret |
| `PUBLIC_URL` | Yes* | Public URL for OAuth callback (required for web auth) |
| `STRAVA_ACCESS_TOKEN` | No | Initial access token (from setup-auth.ts) |
| `STRAVA_REFRESH_TOKEN` | No | Initial refresh token (from setup-auth.ts) |
| `ROUTE_EXPORT_PATH` | No | Absolute path for saving exported route files |
| `TOKEN_DATA_DIR` | No | Override token storage directory (default: `./data`) |
| `PORT` | No | Server port (default: `3000`) |

*Required for Docker/web-based OAuth. Not needed when using `setup-auth.ts` locally.
