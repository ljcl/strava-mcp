# Cadence Trends MCP App

Visualize running cadence progression over time, understand the cadence-pace relationship, and compare form across runs.

## Goals

1. **Am I improving?** — Track average cadence trending upward over weeks
2. **What's my sweet spot?** — Understand the cadence-pace correlation
3. **How consistent am I?** — See cadence variability within and across runs

## Architecture

### New Package: `packages/cadence-trends/`

Follows the same pattern as `packages/activity-chart/`:

- React + Recharts, bundled as single-file HTML via `vite-plugin-singlefile`
- Served as MCP resource at `ui://cadence-trends/app.html`
- Uses `@modelcontextprotocol/ext-apps` SDK (`useApp`, `useHostStyles`)
- Shared components from `packages/ui` (Pill, Legend, Tooltip)
- Design tokens from `packages/design-system`

### New MCP Tools (in `apps/server/`)

**`view-cadence-trends`** (user-facing)

- Input: optional `weeks` param (default: 6)
- Returns text summary of recent cadence stats (run count, avg cadence, trend direction)
- Renders `ui://cadence-trends/app.html`

**`get-cadence-trend-data`** (app-only, visibility: `["app"]`)

- Called by the app on mount
- Fetches recent running activities via Strava `/athlete/activities` endpoint
- Filters to running types (Run, VirtualRun, TrailRun)
- Returns per-run summary:

```typescript
{
  weeks: number;
  activities: Array<{
    id: number;
    name: string;
    date: string;         // ISO date
    distance: number;     // km
    duration: number;     // seconds
    averageCadence: number; // spm (doubled from Strava's strides/min)
    averagePace: number;  // min/km
    type: string;
  }>;
}
```

**Drill-down reuses** the existing `get-activity-streams-raw` tool for per-second stream data when the user selects runs to overlay.

### Data Flow

1. User invokes `view-cadence-trends` (optionally with `weeks`)
2. Server returns text summary + renders the app
3. App calls `get-cadence-trend-data` on mount → summary data for all views
4. User selects runs for overlay → app calls `get-activity-streams-raw` per selected run (lazy, cached in component state)

## Views

The app uses a **Pill selector** to switch between four views: Trend | Scatter | Zones | Overlay.

All views share a **summary stats bar** at the top showing:

- Current avg cadence (last 2 weeks) vs previous period
- Trend direction (up/down/flat) with delta value
- Total run count in the window

### Trend View (Default)

The "Am I improving?" timeline.

- **X-axis**: Date (spanning the time window)
- **Y-axis left**: Average cadence (spm)
- **Y-axis right**: Average pace (min/km)
- Each run is a **dot** on the cadence series, with a second series showing pace
- **Trend line**: 5-run rolling average overlaid on cadence dots
- **Dot sizing**: Larger dots for longer runs (visual weight for meaningful data)
- **Hover tooltip**: Run name, date, distance, avg cadence, avg pace
- **Click**: Selects that run for overlay drill-down

### Scatter Plot View

The "What's my sweet spot?" correlation view.

- **X-axis**: Average pace (min/km), faster paces on the right
- **Y-axis**: Average cadence (spm)
- Each run is a **dot**, colored by recency (more recent = more opaque, older = faded)
- **Dot sizing**: By distance
- **Regression line**: Linear fit showing overall cadence-pace correlation
- **Hover tooltip**: Same run details as trend view
- **Click**: Selects runs for overlay

### Zones View

The "How does cadence differ by effort?" bucketed comparison.

- **Bar chart** with pace zones on X-axis:
  - Easy: >5:30/km
  - Moderate: 4:30–5:30/km
  - Tempo: 4:00–4:30/km
  - Threshold: <4:00/km
- **Y-axis**: Average cadence per zone
- Each bar shows **mean cadence** with whiskers for min/max spread
- **Run count label** on each bar
- **Color**: Cadence orange from design system, intensity varying by zone

### Overlay View

Head-to-head per-second cadence comparison of selected runs.

- **Selection**: Click dots in any other view to select up to 4 runs. Selected runs appear in a selection bar below the pills (run name + date, dismiss button).
- **X-axis**: Normalized distance (km) by default, togglable to time (minutes)
- **Y-axis left**: Cadence (spm)
- **Y-axis right**: Pace (min/km), optional toggle
- Each run is a **line** in a distinct color (from a comparison palette, not metric colors)
- **Smoothing toggle**: Moving-average, on by default (per-second cadence is noisy)
- **Legend**: Each run by color with name + date, clickable to toggle visibility
- **Hover**: Synced crosshair, tooltip shows cadence (and pace if toggled) per run
- **Loading**: Indicator per run while streams fetch; previously fetched streams cached in state

## App Components

```
packages/cadence-trends/src/
├── main.tsx          # MCP app lifecycle, data fetch on mount
├── App.tsx           # Top-level state: active view, selected runs, streams cache
├── SummaryBar.tsx    # Stats bar (current avg, delta, run count)
├── TrendView.tsx     # Timeline chart with rolling average
├── ScatterView.tsx   # Scatter plot with regression line
├── ZonesView.tsx     # Bar chart with whiskers
├── OverlayView.tsx   # Multi-run line overlay, triggers stream fetch on selection
├── normalize.ts      # Pace conversion, rolling average, zone bucketing, regression
├── types.ts          # Shared type definitions
└── styles/           # CSS Modules
```

## Server Changes

In `apps/server/src/server.ts`:

- Register `view-cadence-trends` tool (user-facing)
- Register `get-cadence-trend-data` tool (app-only)
- Add handler functions for both
- Register `ui://cadence-trends/app.html` resource
- Serve `dist/cadence-trends/app.html` from disk

The `get-cadence-trend-data` handler:

- Uses existing Strava API client to fetch `/athlete/activities`
- Paginates as needed to cover the requested `weeks` window
- Filters to running activity types
- Doubles cadence (Strava returns strides/min, runners think in steps/min)
- Converts velocity_smooth (m/s) to pace (min/km)

## Design Tokens

Uses existing design system. Key colors:

- Cadence: `var(--chart-cadence)` (orange, #f97316)
- Pace: `var(--chart-pace)` (blue, #3b82f6)
- Overlay comparison palette: 4 distinct colors for up to 4 overlaid runs (to be defined, distinct from metric colors)
