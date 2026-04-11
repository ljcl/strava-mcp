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
- `packages/cadence-trends/` — React + Recharts MCP App for cadence trend analysis
- `packages/data/` — Shared pure data utilities (formatting, activity types, smoothing)
- `packages/ui/` — Shared presentational React components (Pill, Tooltip, Legend)
- `packages/design-system/` — Shared design tokens and color constants
- `packages/tsconfig/` — Shared TypeScript configurations
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
| `view-cadence-trends` | Interactive cadence trends with timeline, scatter, zones, and overlay views (MCP App) |
| `get-cadence-trend-data` | Summary cadence/pace data for the cadence trends UI (app-only) |

## Styling

- Use CSS Modules (`*.module.css`) for all React component styling — no inline `style={}` for static styles
- Use `data-*` attributes for state-driven variants (e.g. `data-active`, `data-hidden`)
- Keep inline `style` only for truly dynamic values computed at runtime (e.g. per-entry colors from props)
- Recharts component props (`stroke`, `fill`, `strokeWidth`, etc.) are library API and stay as props
- Design tokens come from `packages/design-system` via CSS custom properties (`var(--color-*)`, `var(--font-*)`)

## MCP App (Activity Chart)

https://modelcontextprotocol.io/docs/extensions/apps

The `view-activity-chart` tool renders an interactive Recharts chart in MCP-compatible hosts.

- Uses `@modelcontextprotocol/ext-apps` SDK with React hooks (`useApp`, `useHostStyles`)
- Bundled as single HTML file via `vite-plugin-singlefile`
- Served as MCP resource at `ui://activity-chart/app.html`
- Calls `get-activity-streams-raw` (app-only visibility) to fetch data after render
- Supports heart rate, power, pace, altitude, cadence, and grade overlays

## MCP App (Cadence Trends)

The `view-cadence-trends` tool renders an interactive cadence analysis dashboard in MCP-compatible hosts.

- Uses `@modelcontextprotocol/ext-apps` SDK with React hooks (`useApp`, `useHostStyles`)
- Bundled as single HTML file via `vite-plugin-singlefile`
- Served as MCP resource at `ui://cadence-trends/app.html`
- Calls `get-cadence-trend-data` (app-only) to fetch summary data on mount
- Calls `get-activity-streams-raw` (app-only) for per-second overlay data on demand
- Four views: Trend timeline, Scatter plot, Pace Zones, Overlay comparison

## Targeting Mobile for MCP Apps

These patterns are used in both MCP App packages. Replicate them when adding a new MCP App.

### Detecting mobile

Use `useMobileMode(hostCtx)` from `@strava-mcp/ui`. Do not roll your own detection.

Five signals at a 640px breakpoint, any one triggers mobile:

1. `host.platform === "mobile"` (strongest, rarely populated)
2. `deviceCapabilities.touch && !deviceCapabilities.hover`
3. `containerDimensions.width` or `maxWidth` under the breakpoint
4. Live `window.innerWidth` via `useSyncExternalStore` (the reliable fallback on Claude iOS where the first three are empty)
5. UA sniff for iPhone, iPad, Android

640px covers iPhone Pro Max, rotated iPad split view, and narrow desktop side panels.

Bias toward mobile. False-positive mobile on desktop is cosmetic. False-negative on mobile makes charts unreadable.

### Card chrome

MCP Apps own their outer chrome, not the host:

1. Server emits `_meta: { ui: { prefersBorder: false } }` on BOTH the resource descriptor AND the content response. Two places to update per resource.
2. App wraps content in a card with background, border, border-radius, responsive padding:
   - Mobile `{ y: 16, x: 14 }`, desktop `{ y: 24, x: 20 }`, each plus `safeAreaInsets.*` via `calc()`
3. Mobile adds `margin: 3` on the outer card. Claude iOS gives the iframe zero surrounding padding, so without the margin the card's border gets clipped at the iframe edge.

### Card width constraint

```js
{
  boxSizing: "border-box",
  width: `calc(100% - ${outerMargin * 2}px)`,
  overflow: "hidden",
}
```

Without this, a too-wide child forces the card wider than the iframe and causes horizontal scroll plus a clipped header. Observed root cause: footer pills exceeding 360px.

Footer rows use `flex-wrap: wrap` and `align-items: stretch` on compact so the legend drops below controls and wraps into multiple rows.

### Theming via host

`packages/design-system/src/tokens.css` intentionally has no `@media (prefers-color-scheme: dark)` rule. The host injects theme vars through `useHostStyles()`, and a media query on `:root` fights partial host overrides (some vars from the host, others from the OS, mixing light and dark tokens).

Dark mode on Claude iOS flows entirely from the host. When Claude is dark, it sends dark vars. When Claude is light, the app stays light regardless of the OS.

Storybook simulates dark via the `[data-theme="dark"]` selector on its decorator, which is still wired up.

### Recharts tick label margins

Default `bottom: 24` in the chart margin. Recharts renders tick labels inside `margin.bottom` (4px tickMargin plus 11px font plus descender), and anything under ~16px clips label descenders. Under the card's `overflow: hidden` plus border-radius, clipped descenders are very visible.

### Mobile token patterns

Views take a `mode: "mobile" | "desktop"` prop and derive tokens:

- Axis font 14 mobile, 13 desktop
- Stroke widths 2.25 mobile, 2 desktop
- Narrower chart aspect on mobile (0.95 vs 1.8 for activity-chart)
- Tighter chart margins, tighter YAxis width (34 vs 40px)
- Drop YAxis `label` titles on mobile
- Drop dense overlays that crowd small screens (e.g. grade on the altitude axis)
- Hide secondary controls that cost footer width (e.g. the Smooth toggle, defaulted on)
- `Legend` takes `size="touch"` for tappable vertical padding

### Storybook mobile previews

Every view gets a mobile story using:

- `globals: { viewport: { value: "claudeIosCard" } }` for the 360x780 iframe
- `parameters: { layout: "fullscreen" }` to remove Storybook's outer padding
- A `MobileCardShell` decorator wrapping the story in the same 3px margin plus 16/14 card chrome the app ships with

This matches what renders inside the host iframe, not Storybook's default padded canvas.

## Commands

```bash
bun install          # Install all deps (workspace-aware)
bun run build        # Build all packages (via Turborepo)
bun run test         # Run all tests (via Turborepo)
bun run typecheck     # Typecheck all packages (via Turborepo)
bun run lint         # Lint all packages (Biome)
bun run lint:fix     # Auto-fix lint issues
bun run dev          # Dev mode (via Turborepo)

# Server only
cd apps/server
bun run start        # Start server
bun run dev          # Watch mode
bun run test         # Run server tests (Vitest)
bun run test:watch   # Watch mode
bun run setup-auth   # Interactive localhost OAuth setup (dev only)

# UI development
cd apps/storybook
bun run storybook    # Storybook on port 6006

cd packages/activity-chart
INPUT=app.html bunx vite build  # Rebuild single-file HTML

cd packages/cadence-trends
INPUT=app.html bunx vite build  # Rebuild single-file HTML

# Docker
docker compose build
docker compose up -d
docker compose logs -f
```

## Docker

Built via `turbo prune @strava-mcp/server --docker`. Adding a new workspace package does not require editing the Dockerfile; turbo prune derives the package set from the workspace graph. The server's MCP App resources are resolved at runtime via `createRequire(...).resolve("@strava-mcp/activity-chart/app.html")` so each app package must declare an `./app.html` export and a `dist/` build output.

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
| `STRAVA_ACCESS_TOKEN` | No | Initial access token (from `bun run setup-auth`) |
| `STRAVA_REFRESH_TOKEN` | No | Initial refresh token (from `bun run setup-auth`) |
| `ROUTE_EXPORT_PATH` | No | Absolute path for saving exported route files |
| `TOKEN_DATA_DIR` | No | Override token storage directory (default: `./data`) |
| `PORT` | No | Server port (default: `3000`) |

*Required for Docker/web-based OAuth. Not needed when using `bun run setup-auth` locally.
