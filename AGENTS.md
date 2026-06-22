# Strava MCP Server

Remote MCP server for connecting AI tools to your Strava data.

## Architecture

- **Runtime**: Bun (TypeScript)
- **Transport**: Streamable HTTP on port 3000 (`/mcp` endpoint)
- **Deployment**: Docker container, exposed via HTTPS tunnel or reverse proxy
- **Monorepo**: Bun workspaces with Turborepo (`apps/*` + `packages/*`)
- **HTTP layer**: `apps/server/src/fetchClient.ts` owns all rate-limit awareness and backoff. It parses Strava's `X-RateLimit-*` / `Retry-After` headers (snapshot via `stravaApi.getRateLimitSnapshot()`), retries 429s honouring `Retry-After`, and retries transient 5xx / network faults with bounded exponential backoff — GET/HEAD only, never writes. Add retry/limit logic here, not per-tool. Exhausted-limit 429s surface as a structured `RateLimitError` that `handleApiError` (`stravaClient.ts`) turns into an actionable message.
- **Response cache**: `fetchClient.ts` also owns an opt-in TTL + LRU cache (`apps/server/src/cache.ts`, `TtlLruCache`) for immutable-ish GETs, to relieve rate-limit pressure (e.g. `get-best-efforts` re-fetching activity detail per activity). The `stravaCacheTtl` policy keys caching by request path: activity streams 6h and detailed activity 1h (immutable-once-recorded), athlete profile/stats 5m; everything else (lists, segments, routes, exports, sub-resources) is uncached. The cache key is the full URL (query included, so distinct stream resolutions stay separate); TTL and invalidation match on the query-stripped path. A successful write invalidates every cached read under the same resource path, so `update-activity` drops the activity's cached detail/streams/zones/laps. A request can pass `skipCache: true` to bypass entirely — the `update-activity` append read does this so it never composes onto a stale description. Add caching policy in `stravaCacheTtl`, not per-tool.

## Key Directories

- `apps/server/` — MCP server (tools, auth, token management)
- `packages/activity-chart/` — React + Recharts MCP App for interactive activity charts
- `packages/cadence-trends/` — React + Recharts MCP App for cadence trend analysis
- `packages/route-map/` — React (pure SVG, no Recharts) MCP App for activity/route GPS maps
- `packages/data/` — Shared pure data utilities (formatting, activity types, smoothing)
- `packages/ui/` — Shared presentational React components (Pill, Tooltip, Legend)
- `packages/design-system/` — Shared design tokens, color constants, and Storybook preview
- `packages/vite-config/` — Shared Vite config for MCP App single-file builds
- `packages/tsconfig/` — Shared TypeScript configurations
- `docs/plans/` — Design docs and implementation plans

## Agent Skills

Project-scoped Agent Skills are vendored under `.agents/skills/` and surfaced to Claude Code via
symlinks in `.claude/skills/`. Externally-sourced skills are tracked in `skills-lock.json` (source
+ content hash); locally-authored skills are not locked.

- `mcp-authoring` — locally-authored, framework-neutral guidance for building and reviewing MCP
  servers and apps (primitives, tool schema design, MCP App UI, OAuth, testing). Use it when
  changing server tools, resources, or the MCP App packages.
- `bun` — Bun runtime, package manager, test runner, and bundler usage (well-known source).
- `github-actions-docs` — docs-grounded help for the workflows under `.github/` (GitHub source).

## MCP Tools

### Activity Tools

| Tool | Description |
| ---- | ----------- |
| `update-activity` | Update an activity's description, title, sport type, gear, or flags |
| `get-activity-zones` | Time spent in each HR and power zone for an activity |
| `get-activity-photos` | Photos from an activity |
| `get-running-summary` | Running-focused summary with HR zones and lap analysis |
| `get-training-load` | Training load summary with trend analysis |
| `compare-activities` | Compare two running activities side-by-side |
| `get-best-efforts` | Personal best efforts across all running activities |

### Athlete Tools

| Tool | Description |
| ---- | ----------- |
| `get-athlete-stats` | Activity statistics (recent, YTD, all-time) |

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
| `view-route-map` | Interactive map of an activity or route GPS track, fit to bounds with start/finish markers (MCP App) |
| `get-route-map-data` | Decoded `[lat, lng]` coordinates for the route map UI (app-only) |

## Styling

- Use CSS Modules (`*.module.css`) for all React component styling — no inline `style={}` for static styles
- Use `data-*` attributes for state-driven variants (e.g. `data-active`, `data-hidden`)
- Keep inline `style` only for truly dynamic values computed at runtime (e.g. per-entry colors from props)
- Recharts component props (`stroke`, `fill`, `strokeWidth`, etc.) are library API and stay as props
- Design tokens come from `packages/design-system` via CSS custom properties (`var(--color-*)`, `var(--font-*)`)
- Spacing: use `var(--space-*)` tokens (`--space-0-5` through `--space-6`, a 4px grid with half-steps) instead of hardcoded px
- Border radius: full-rounded elements use `var(--border-radius-full)`
- Line heights outside the default 1.5: use `var(--line-height-tight)` or `var(--line-height-relaxed)`
- Uppercase label letter spacing: `var(--letter-spacing-wide)`
- Shared Recharts numeric tokens live in `packages/design-system/src/chart-tokens.ts`. Use `getChartTokens(mode)` in any new chart view; per-chart layout margins stay local
- `MOBILE_BREAKPOINT_PX` lives in design-system and is re-exported from `packages/ui`

### Headless primitives (Base UI)

[Base UI](https://base-ui.com/) (`@base-ui/react`, pinned in `packages/ui`) is the headless
primitive of record for any non-trivial interactive control — anything that needs focus
management, positioning, dismissal, or roving tabindex (Select, Menu, Dialog, Popover, Combobox,
Slider, ToggleGroup, etc.). Reach for it before hand-rolling these. Keep all styling in CSS Modules
with `data-*` selectors (Base UI exposes `data-pressed`, `data-disabled`, etc.; you can also keep
passing your own `data-*` where the existing selectors expect them). Use `@base-ui/react`, not the
frozen `@base-ui-components/react`.

- `Pill` / `PillGroup` and `Legend` / `LegendItem` (`packages/ui`) are built on Base UI
  `Toggle` / `ToggleGroup`: the group provides `role="group"`, arrow-key roving focus, and a single
  Tab stop. The group's pressed `value` array is derived from the children's `active` / `hidden`
  props and an index value is injected per child, so the public component props are unchanged.
- Not every component needs a primitive. `Tooltip` (rendered inside Recharts' tooltip, which owns
  positioning), `Skeleton`, and `AppShell` are presentational and stay hand-rolled.
- Chart descriptions / `accessibilityLayer` are tracked separately in #28; this convention owns the
  interactive-control migration.

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

## MCP App (Route Map)

The `view-route-map` tool renders an activity's or saved route's GPS track as a self-contained map in MCP-compatible hosts.

- Uses `@modelcontextprotocol/ext-apps` SDK with React hooks (`useApp`, `useHostStyles`)
- Bundled as single HTML file via `vite-plugin-singlefile`; **no Recharts**. Defaults to a MapLibre basemap (network for tiles); a pure-SVG offline grid is the automatic fallback when tiles fail
- Served as MCP resource at `ui://route-map/app.html`
- Calls `get-route-map-data` (app-only) on mount with the `activity_id` or `route_id`
- For activities the server prefers the `latlng` stream over the polyline and returns index-aligned metric streams (time, distance, altitude, heartrate, watts, velocity_smooth, grade_smooth) alongside the coordinates; saved routes and stream-less activities fall back to the decoded polyline with no streams
- Polyline fallback geometry is decoded server-side to `[lat, lng]` pairs in `apps/server/src/polyline.ts` (unit-tested next to the zod schemas) so the bundle stays lean
- Projection math (`src/normalize.ts`, unit-tested) fits the track to bounds with padding, scales longitude by `cos(latitude)` to avoid east–west stretch, and flips latitude so north is up. Start/finish markers, distance + elevation summary; neutral grid background, no basemap imagery
- When metric streams are present the track is coloured by a selectable metric (pace/speed, heart rate, power, elevation, gradient) as binned same-colour path runs (`src/metrics.ts`, unit-tested), with a gradient scale legend, a pointer/touch scrub (nearest-point crosshair + tooltip), and a linked elevation strip (`src/elevationProfile.ts`, unit-tested) sharing the scrub index with the track
- Zoom/pan via SVG viewBox windowing (`src/panZoom.ts`, unit-tested): wheel + drag on desktop, pinch + drag on mobile, clamped to the base frame with a Reset pill; marker/stroke sizes counter-scale so they stay screen-constant. `touch-action` is `pan-y` at base zoom (page keeps scrolling) and `none` once zoomed (drag pans)
- Annotation layers, each toggleable via the footer legend: lap or km split dots (`src/annotations.ts`, unit-tested; km marks thinned 1/2/5… per length), segment-effort halo spans (gold = PR, light purple = top-10), and grouped photo pins. The server resolves anchors to coordinate indices in `apps/server/src/mapAnchors.ts` (unit-tested) because Strava lap/effort indices reference the full-resolution stream, not the downsampled one. The lap/photo markers render in both views (grid as SVG `<title>` overlays, basemap as MapLibre hover popups themed via `global.css` so they read on the dark map)
- Segment efforts split presentation from data (`src/segments.ts`, unit-tested). The server returns up to 60 efforts with `distanceMeters`; only a lean subset earns a drawn halo — every PR/top-10 plus the longest few (`selectOutlineSegments`, behind the "Segments" toggle) — so a segment-dense activity does not bury the track. Every effort covering the scrubbed point is listed in the one shared scrub tooltip regardless of the toggle (`segmentsAtIndex`, PR-first then most-specific, capped to 3 + "N more"), so the white per-segment MapLibre popup is gone and no longer clashes with the metric value
- MapLibre basemap (`src/BasemapView.tsx`, OpenFreeMap Liberty style) is the **default view**; a failed style load falls back silently to the offline SVG grid (which also keeps the SVG zoom/pan). The track renders as GeoJSON line features reusing the same color binning (`buildColorRuns`; GeoJSON builders in `src/basemapData.ts`, unit-tested — MapLibre paints canvas so colors there are concrete hex, not CSS vars), with MapLibre's native zoom/pan behind `cooperativeGestures` (no scroll trap), OSM attribution via MapLibre's control, and the scrub tooltip positioned via `map.project`. The tile origin is allowlisted via `_meta.ui.csp` on the route-map resource (descriptor + content response, see `docs/plans/basemap-tile-source.md`). maplibre-gl is inlined by the single-file build, importing MapLibre's **CSP build** and inlining its official pre-built worker as a `?raw` Blob URL via `maplibregl.setWorkerUrl` (`maplibre-csp.d.ts` types the deep import). This is load-bearing: the default build's self-built worker loses its GeoJSON code path once vite-plugin-singlefile flattens the bundle, so tiles render but every GeoJSON overlay (track, markers, halos) throws in the worker and silently vanishes — the CSP worker is self-contained and never re-bundled. Do not revert to `import maplibregl from "maplibre-gl"`. app.html ~658 KB → ~2.16 MB raw (~172 KB → ~563 KB gz). Grid stories pin `basemapEnabled: false` so Chromatic snapshots stay deterministic; the Basemap stories set `chromatic: { disableSnapshot: true }` (live tiles would diff every run)

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

Views take a `mode: "mobile" | "desktop"` prop and spread `getChartTokens(mode)` from `@strava-mcp/design-system` into their local `tokens` object. That provides the shared numeric values:

- Axis font 14 mobile, 13 desktop
- Stroke widths 2.25 mobile, 2 desktop
- Secondary stroke widths 1.75 mobile, 1.5 desktop (e.g. cadence overlay)
- Dot scale 0.75 mobile, 1 desktop
- Error bar width, label font size, legend size variants

Per-chart layout values stay local (they differ by layout intent):

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

## Verification sweep

Run this gate before declaring a task complete, opening a PR, or cutting a release. Each step is a hard requirement; if any fail, fix before moving on.

The fastest local gate is `bun run check`, which runs lint, test, typecheck, build, and boundaries through Turborepo with full caching. On a branch, prefer `bun run check:affected` to skip unchanged packages entirely.

```bash
bun run check             # Lint + test + typecheck + build + boundaries (cached via Turborepo)
bun run check:affected    # Same, but only packages changed since main
docker compose build      # Server container builds from current sources
```

Individual steps if needed:

```bash
bun run typecheck         # TS across every workspace package
bun run lint              # Biome (root task, not per-package)
bun run test              # Vitest (server + any package with tests)
bun run build             # Turborepo build (produces MCP App single-file HTML bundles)
bun run boundaries        # Package boundary enforcement (turbo boundaries)
bun run knip              # Dead code / unused export analysis
```

Supplementary checks when the change touches UI:

- Storybook sweep: visit each affected story in desktop and the `claudeIosCard` mobile viewport. The claude-in-chrome or storybook MCP tools can do this without leaving the session.
- MCP endpoint smoke test: `cd apps/server && bun run start`, then `curl http://localhost:3000/health` from another shell. Needs valid `STRAVA_REFRESH_TOKEN`; skip if tokens are stale and note it explicitly.

## Commands

```bash
bun install               # Install all deps (workspace-aware)
bun run check             # Full verification: lint + test + typecheck + build + boundaries
bun run check:affected    # Same, but only packages changed since main
bun run build             # Build all packages (via Turborepo)
bun run build:affected    # Build only changed packages
bun run test              # Run all tests (via Turborepo)
bun run typecheck         # Typecheck all packages (via Turborepo)
bun run typecheck:affected # Typecheck only changed packages
bun run lint              # Lint all packages (Biome, root task)
bun run lint:fix          # Auto-fix lint issues
bun run knip              # Dead code / unused export analysis
bun run boundaries        # Package boundary enforcement
bun run dev               # Dev mode (via Turborepo)

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

cd packages/route-map
INPUT=app.html bunx vite build  # Rebuild single-file HTML

# Docker
docker compose build
docker compose up -d
docker compose logs -f
```

## Turborepo

The monorepo uses a `topo` transit node in `turbo.json` so that `test` and `typecheck` cache-invalidate correctly when upstream JIT packages change source. JIT packages (`data`, `ui`, `design-system`) export raw TypeScript; only `activity-chart`, `cadence-trends`, and `route-map` produce build artifacts (single-file HTML bundles via Vite). The server has no build step.

Biome (`//#lint`) and Knip (`//#knip`) run as root tasks. Biome is fast enough to run at root per the Turborepo docs. Knip is a whole-graph analyzer that cannot be decomposed per-package.

Storybook uses the co-located stories pattern: story files in `packages/` are excluded from the root `build` inputs (`!**/*.stories.{ts,tsx,mdx}`) so story edits do not bust unrelated build caches. The `build:storybook` task has its own cache tracked in `apps/storybook/turbo.json`.

Package boundaries are enforced via `turbo boundaries`. Six tags: `app`, `mcp-app`, `shared-ui`, `shared-data`, `design-system`, `config`. Key rules: apps cannot cross-import, mcp-apps cannot cross-import, `data` is pure (no React), `design-system` sits at the bottom. Run `bun run boundaries` to check locally; CI enforces on every PR.

Do NOT change root `lint` to `turbo run lint` (would create an infinite loop). Biome runs directly via root `lint`; turbo dispatches it only when invoked through `bun run check` or `turbo run lint`.

## Docker

Built via `turbo prune @strava-mcp/server --docker`. The Dockerfile's build step uses `--filter=@strava-mcp/server^...` to build only the server's workspace dependencies (the MCP App packages), excluding the server itself since it is JIT. The build (prune) stage derives the package set from the workspace graph, so it needs no edit per package. The server's MCP App resources are resolved at runtime via `createRequire(...).resolve("@strava-mcp/<app>/app.html")`, so each app package must declare an `./app.html` export and a `dist/` build output — and the distroless **runner** stage `COPY`s each app's `dist/` explicitly, so adding an MCP App means adding one `COPY --from=builder .../packages/<app>/dist` line there.

## Storybook and Chromatic

Storybook (`apps/storybook`) renders the UI packages. Two deploys:

- `main` is published to GitHub Pages (`storybook.yml`) and to Chromatic.
- Each PR that touches a UI package is published to Chromatic (`chromatic.yml`), which posts two PR checks: `Storybook Publish` (a link to that branch's hosted Storybook) and `UI Tests` (visual diffs against the `main` baseline). It is a review aid, not a merge gate (`exitZeroOnChanges`); `autoAcceptChanges: main` advances the baseline as changes land.

TurboSnap (`onlyChanged`) only snapshots stories affected by the diff, to conserve the free-plan budget. It relies on `preview-stats.json` (emitted by `--stats-json` in `build:storybook`) and `storybookBaseDir: apps/storybook`. Stories are co-located in `packages/*`, so when tracing cannot resolve a change it snapshots conservatively rather than missing a regression. Requires `CHROMATIC_PROJECT_TOKEN` as a repo secret.

### Agent access

- A PR's hosted Storybook URL and diff status: `gh pr checks <PR>` (the `Storybook Publish` and `UI Tests` rows).
- Storybook ships a Model Context Protocol server (via `@storybook/addon-mcp`) with story, docs, and test tools. Endpoints are pre-wired in `.mcp.json`:
  - `storybook`: `http://localhost:6006/mcp` (while `bun run storybook` is running)
  - `storybook-chromatic`: `https://main--6a261929a3cb4ac107f3c06d.chromatic.com/mcp` (the hosted `main` build; live after the first main publish)
- Publish on demand: `CHROMATIC_PROJECT_TOKEN=... bunx chromatic --storybook-build-dir apps/storybook/storybook-static`.

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

## Backlog and issue tracking

Improvements and changes are tracked as GitHub Issues and triaged on the
"strava-mcp backlog" Project board (https://github.com/users/ljcl/projects/1).

- File issues via the templates (Improvement, Bug report); blank issues are allowed.
- Labels: `type:*` mirrors Conventional Commit types (feat, fix, perf, refactor,
  docs, test, chore, ci); `area:*` maps to monorepo packages (server, mcp-app,
  data, ui, design-system, ci-release, docker, repo). Bot and community labels
  (dependencies, autorelease:*, good first issue) are managed automatically.
- Priority (P1/P2/P3), Effort (S/M/L), and Status live as Project board fields,
  not labels, so triage data is not duplicated across two systems.
- New issues auto-add to the board (Backlog). Link PRs with `closes #N` so a
  merge closes the issue; the PR title is the Conventional Commit that
  release-please turns into a release.

## Releases

Releases are automated by release-please (`.github/workflows/release-please.yml`).

- PRs are squash-merged, so the **PR title becomes the only commit on `main`**. The PR
  title therefore must be a Conventional Commit, or release-please sees no releasable
  change and silently skips (the run still reports success). The `pr-title.yml` workflow
  enforces this on every PR, and the repo squash setting is pinned to `PR_TITLE` so the
  title is always what lands. Branch commits can be messy; only the PR title matters.
- Use Conventional Commits: `fix:` gives a patch bump, `feat:` a minor bump,
  `feat!:` or a `BREAKING CHANGE:` footer a major bump. `chore:`, `docs:`, `refactor:`,
  and `ci:` are valid titles but produce no release.
- release-please opens a `chore: release X.Y.Z` PR that bumps root `package.json`,
  both `server.json` version fields, and `CHANGELOG.md`.
- Merging that PR pushes the `vX.Y.Z` tag (via the `RELEASE_PLEASE_PAT` secret), which
  triggers `docker.yml` to publish `ghcr.io/ljcl/strava-mcp:X.Y.Z` and `:X.Y`.
- Manual `git tag vX.Y.Z` still works as a fallback; `docker.yml` triggers on `v*` tags
  regardless of how they are created.
