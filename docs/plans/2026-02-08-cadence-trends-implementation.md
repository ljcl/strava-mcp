# Cadence Trends MCP App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new MCP App that visualizes running cadence progression over time with four views: Trend timeline, Scatter plot, Zones bar chart, and per-second Overlay comparison.

**Architecture:** New `packages/cadence-trends/` package (React + Recharts, single-file HTML via Vite), two new server tools (`view-cadence-trends` user-facing, `get-cadence-trend-data` app-only), reuses existing `get-activity-streams-raw` for drill-down. Follows identical patterns to `packages/activity-chart/`.

**Tech Stack:** React 19, Recharts 3, `@modelcontextprotocol/ext-apps`, Vite + vite-plugin-singlefile, CSS Modules, `@strava-mcp/ui` + `@strava-mcp/design-system`.

**Design doc:** `docs/plans/2026-02-08-cadence-trends-design.md`

**Worktree:** `.worktrees/cadence-trends/` on branch `feature/cadence-trends`

---

## Task 1: Package Scaffold

Set up the `packages/cadence-trends/` package with build tooling, matching `packages/activity-chart/` exactly.

**Files:**
- Create: `packages/cadence-trends/package.json`
- Create: `packages/cadence-trends/tsconfig.json`
- Create: `packages/cadence-trends/turbo.json`
- Create: `packages/cadence-trends/vite.config.ts`
- Create: `packages/cadence-trends/app.html`
- Create: `packages/cadence-trends/src/global.css`
- Create: `packages/cadence-trends/src/main.tsx` (minimal placeholder)
- Create: `packages/cadence-trends/src/types.ts`

**Step 1: Create `packages/cadence-trends/package.json`**

```json
{
  "name": "@strava-mcp/cadence-trends",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "INPUT=app.html vite build",
    "dev": "INPUT=app.html vite build --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.0.1",
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@strava-mcp/design-system": "workspace:*",
    "@strava-mcp/ui": "workspace:*",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "recharts": "^3.7.0"
  },
  "devDependencies": {
    "@strava-mcp/tsconfig": "workspace:*",
    "@types/react": "^19.2.11",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.3",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vite-plugin-singlefile": "^2.3.0"
  }
}
```

**Step 2: Create `packages/cadence-trends/tsconfig.json`**

```json
{
  "extends": "@strava-mcp/tsconfig/react.json",
  "include": ["src"]
}
```

**Step 3: Create `packages/cadence-trends/turbo.json`**

```json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": ["../../dist/cadence-trends/**"]
    }
  }
}
```

**Step 4: Create `packages/cadence-trends/vite.config.ts`**

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const INPUT = process.env.INPUT;

export default defineConfig({
  plugins: [react(), ...(INPUT ? [viteSingleFile()] : [])],
  build: INPUT
    ? {
        rollupOptions: { input: INPUT },
        outDir: "../../dist/cadence-trends",
        emptyOutDir: false,
      }
    : {},
});
```

**Step 5: Create `packages/cadence-trends/app.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Cadence Trends</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 6: Create `packages/cadence-trends/src/global.css`**

```css
@import "@strava-mcp/design-system/tokens.css";

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html, body, #root {
  width: 100%;
  font-family: var(--font-sans);
  font-size: var(--font-text-sm-size);
  line-height: var(--font-text-sm-line-height);
  color: var(--color-text-primary);
  background: transparent;
}
```

**Step 7: Create `packages/cadence-trends/src/types.ts`**

```typescript
/** Summary data for a single run, returned by get-cadence-trend-data */
export interface RunSummary {
  id: number;
  name: string;
  date: string;
  distance: number;
  duration: number;
  averageCadence: number;
  averagePace: number;
  type: string;
}

/** Response from get-cadence-trend-data tool */
export interface CadenceTrendData {
  weeks: number;
  activities: RunSummary[];
}

/** Stream data for a single run used in overlay view (reuses activity-chart shape) */
export interface OverlayStreamData {
  activityId: number;
  activityType: string;
  name: string;
  streams: {
    time?: number[];
    distance?: number[];
    cadence?: number[];
    velocity_smooth?: number[];
  };
}

/** A single point in the overlay chart */
export interface OverlayPoint {
  distance: number;
  time: number;
  cadence?: number;
  pace?: number;
}

/** Pace zone definition */
export interface PaceZone {
  label: string;
  minPace: number;
  maxPace: number;
}

/** View identifiers */
export type ViewId = "trend" | "scatter" | "zones" | "overlay";
```

**Step 8: Create minimal `packages/cadence-trends/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";

function Root() {
  return <div style={{ padding: "24px" }}>Cadence Trends — scaffold working</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

**Step 9: Install dependencies and verify build**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bun install`
Expected: Clean install with new workspace resolved

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`
Expected: Build succeeds, outputs `dist/cadence-trends/app.html`

**Step 10: Verify typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`
Expected: No type errors

**Step 11: Commit**

```bash
git add packages/cadence-trends/
git commit -m "feat: scaffold cadence-trends package with build tooling"
```

---

## Task 2: Server Tools — `get-cadence-trend-data` and `view-cadence-trends`

Register two new MCP tools and their handlers in `server.ts`, plus the new resource.

**Files:**
- Modify: `apps/server/src/server.ts`

**Step 1: Add the `RUNNING_TYPES` constant and `handleGetCadenceTrendData` handler**

Add after the `handleGetActivityStreamsRaw` function (after line 234 of `server.ts`):

```typescript
const RUNNING_TYPES = new Set(["Run", "VirtualRun", "TrailRun"]);

async function handleGetCadenceTrendData(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const weeks = Number(args.weeks) || 6;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const after = Math.floor(
    (Date.now() - weeks * 7 * 24 * 60 * 60 * 1000) / 1000,
  );

  // Fetch activities in the time window
  const allActivities: Awaited<ReturnType<typeof getRecentActivitiesFn>>  = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 10) {
    const pageActivities = await getAllActivitiesFn(token, {
      page,
      perPage: 200,
      after,
    });
    if (pageActivities.length === 0) {
      hasMore = false;
    } else {
      allActivities.push(...pageActivities);
      hasMore = pageActivities.length === 200;
      page += 1;
    }
  }

  // Filter to running types
  const runs = allActivities.filter(
    (a) => a.type && RUNNING_TYPES.has(a.type),
  );

  // Map to summary shape
  const activities = runs.map((a) => {
    const avgCadence = a.average_cadence ? a.average_cadence * 2 : 0; // strides → steps
    const avgSpeed = a.average_speed ?? 0;
    const avgPace = avgSpeed > 0 ? 1000 / avgSpeed / 60 : 0; // m/s → min/km
    return {
      id: a.id,
      name: a.name,
      date: a.start_date,
      distance: Math.round((a.distance / 1000) * 100) / 100,
      duration: a.moving_time ?? 0,
      averageCadence: Math.round(avgCadence),
      averagePace: Math.round(avgPace * 100) / 100,
      type: a.type ?? "Run",
    };
  });

  const result = { weeks, activities };
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

async function handleViewCadenceTrends(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const weeks = Number(args.weeks) || 6;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  // Quick count of recent running activities for the summary
  const after = Math.floor(
    (Date.now() - weeks * 7 * 24 * 60 * 60 * 1000) / 1000,
  );
  const activities = await getAllActivitiesFn(token, {
    page: 1,
    perPage: 200,
    after,
  });
  const runs = activities.filter((a) => a.type && RUNNING_TYPES.has(a.type));

  const avgCadence =
    runs.length > 0
      ? Math.round(
          (runs.reduce((sum, a) => sum + (a.average_cadence ?? 0) * 2, 0) /
            runs.length),
        )
      : 0;

  const lines = [
    `Cadence Trends (last ${weeks} weeks)`,
    `Runs: ${runs.length}`,
    `Average cadence: ${avgCadence} spm`,
    "",
    "[Interactive cadence trends chart rendered above]",
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
```

Note: `getAllActivitiesFn` refers to the `getAllActivities` function imported from `stravaClient`. We need to add this import. Add to the imports at the top of `server.ts`:

```typescript
import { getActivityById, getActivityLaps, getAllActivities as getAllActivitiesFn } from "./stravaClient";
```

**Step 2: Register the tools in `buildToolDefs()`**

Add before the `return defs;` line inside `buildToolDefs()`:

```typescript
  defs.push({
    name: "view-cadence-trends",
    description:
      "Renders an interactive cadence trends chart showing running cadence progression over time, " +
      "cadence-pace correlation, pace zone analysis, and per-run overlay comparison.",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks of history to show (default: 6)",
        },
      },
    },
    _meta: {
      ui: { resourceUri: "ui://cadence-trends/app.html" },
    },
  });

  defs.push({
    name: "get-cadence-trend-data",
    description:
      "Get summary cadence and pace data for recent running activities. " +
      "Returns per-run averages for the cadence trends UI.",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks of history (default: 6)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://cadence-trends/app.html",
        visibility: ["app"],
      },
    },
  });
```

**Step 3: Add tool dispatch in `CallToolRequestSchema` handler**

Add before the `// Handle existing Strava tools` comment in the `CallToolRequestSchema` handler:

```typescript
    if (name === "view-cadence-trends") {
      try {
        return await handleViewCadenceTrends(args ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Tool error: ${message}` }],
        };
      }
    }

    if (name === "get-cadence-trend-data") {
      try {
        return await handleGetCadenceTrendData(args ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Tool error: ${message}` }],
        };
      }
    }
```

**Step 4: Register the cadence-trends resource**

In the `ListResourcesRequestSchema` handler, add the new resource to the array:

```typescript
      {
        uri: "ui://cadence-trends/app.html",
        name: "Cadence Trends",
        mimeType: "text/html;profile=mcp-app",
      },
```

In the `ReadResourceRequestSchema` handler, add a new `if` block before the `throw`:

```typescript
    if (uri === "ui://cadence-trends/app.html") {
      const htmlPath = path.join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "dist",
        "cadence-trends",
        "app.html",
      );
      const html = await fs.readFile(htmlPath, "utf-8");
      return {
        contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: html }],
      };
    }
```

**Step 5: Verify typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/apps/server && bunx tsc --noEmit`
Expected: No type errors

**Step 6: Run existing tests to ensure no regressions**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bunx turbo run test`
Expected: All 104 tests pass

**Step 7: Commit**

```bash
git add apps/server/src/server.ts
git commit -m "feat: add view-cadence-trends and get-cadence-trend-data MCP tools"
```

---

## Task 3: MCP App Entry Point — `main.tsx`

Wire up the MCP app lifecycle: connect to host, receive tool input, fetch summary data, render shell.

**Files:**
- Modify: `packages/cadence-trends/src/main.tsx`
- Modify: `packages/cadence-trends/src/types.ts`

**Step 1: Update `main.tsx` with MCP app lifecycle**

Replace the placeholder with the full MCP app entry point:

```tsx
import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { CadenceTrendData } from "./types";
import "./global.css";

interface ToolArgs {
  weeks?: number;
}

function parseTrendData(result: CallToolResult): CadenceTrendData | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as CadenceTrendData;
  } catch {
    return null;
  }
}

interface AppContentProps {
  app: ReturnType<typeof useApp>["app"];
  toolArgs: ToolArgs;
  safeAreaInsets?: McpUiHostContext["safeAreaInsets"];
}

function AppContent({ app, toolArgs, safeAreaInsets }: AppContentProps) {
  const [data, setData] = useState<CadenceTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: "get-cadence-trend-data",
        arguments: { weeks: toolArgs.weeks ?? 6 },
      });
      const trendData = parseTrendData(result);
      if (!trendData) {
        setError("Failed to parse trend data");
        return;
      }
      setData(trendData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [app, toolArgs.weeks]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ color: "var(--color-text-secondary)", padding: "24px" }}>
        Loading cadence data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ color: "var(--color-text-danger, #c00)", padding: "24px" }}>
        {error ?? "No cadence data available"}
      </div>
    );
  }

  return (
    <div
      style={{
        paddingBottom: safeAreaInsets?.bottom,
        paddingLeft: safeAreaInsets?.left,
        paddingRight: safeAreaInsets?.right,
        paddingTop: safeAreaInsets?.top,
      }}
    >
      <App app={app} data={data} />
    </div>
  );
}

function Root() {
  const [toolArgs, setToolArgs] = useState<ToolArgs | null>(null);
  const [safeAreaInsets, setSafeAreaInsets] =
    useState<McpUiHostContext["safeAreaInsets"]>();

  const { app, error: connectError } = useApp({
    appInfo: { name: "Cadence Trends", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (input) => {
        const args = input.arguments as ToolArgs | undefined;
        setToolArgs(args ?? {});
      };
      createdApp.onhostcontextchanged = (ctx) => {
        if (ctx.safeAreaInsets) {
          setSafeAreaInsets(ctx.safeAreaInsets);
        }
      };
      createdApp.onerror = console.error;
    },
  });

  useHostStyles(app, app?.getHostContext());

  if (connectError)
    return (
      <div style={{ padding: "24px" }}>
        Connection error: {connectError.message}
      </div>
    );
  if (!app) return <div style={{ padding: "24px" }}>Connecting...</div>;
  if (!toolArgs)
    return <div style={{ padding: "24px" }}>Waiting for data...</div>;

  return (
    <AppContent app={app} toolArgs={toolArgs} safeAreaInsets={safeAreaInsets} />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

**Step 2: Create stub `packages/cadence-trends/src/App.tsx`**

```tsx
import type { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CadenceTrendData } from "./types";

interface AppProps {
  app: ReturnType<typeof useApp>["app"];
  data: CadenceTrendData;
}

export function App({ data }: AppProps) {
  return (
    <div style={{ padding: "16px" }}>
      <p>Loaded {data.activities.length} runs over {data.weeks} weeks</p>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`
Expected: Build succeeds

**Step 4: Verify typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: wire up MCP app lifecycle and data fetching in main.tsx"
```

---

## Task 4: Data Normalization — `normalize.ts`

Pure utility functions for computing summary stats, rolling averages, pace zones, and linear regression. All logic lives here — views are purely presentational.

**Files:**
- Create: `packages/cadence-trends/src/normalize.ts`

**Step 1: Create `normalize.ts`**

```typescript
import type { OverlayPoint, OverlayStreamData, PaceZone, RunSummary } from "./types";

/** Pace zones in min/km. Lower number = faster pace. */
export const PACE_ZONES: PaceZone[] = [
  { label: "Threshold", minPace: 0, maxPace: 4 },
  { label: "Tempo", minPace: 4, maxPace: 4.5 },
  { label: "Moderate", minPace: 4.5, maxPace: 5.5 },
  { label: "Easy", minPace: 5.5, maxPace: 20 },
];

/** Format min/km as M'SS" */
export function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  if (secs === 60) return `${mins + 1}'00"`;
  return `${mins}'${String(secs).padStart(2, "0")}"`;
}

/** Format seconds as Mm or HhMm */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h${rem > 0 ? `${rem}m` : ""}`;
}

/** Compute a rolling average over the activities array (sorted by date ascending) */
export function rollingAverage(
  activities: RunSummary[],
  window: number,
): Array<{ date: string; cadence: number }> {
  const sorted = [...activities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return sorted.map((_, i) => {
    const lo = Math.max(0, i - Math.floor(window / 2));
    const hi = Math.min(sorted.length - 1, i + Math.floor(window / 2));
    let sum = 0;
    let count = 0;
    for (let j = lo; j <= hi; j++) {
      if (sorted[j]!.averageCadence > 0) {
        sum += sorted[j]!.averageCadence;
        count++;
      }
    }
    return {
      date: sorted[i]!.date,
      cadence: count > 0 ? Math.round(sum / count) : 0,
    };
  });
}

/** Compute summary stats: current period avg, previous period avg, delta */
export function computeSummaryStats(
  activities: RunSummary[],
  weeks: number,
): { currentAvg: number; previousAvg: number; delta: number; runCount: number } {
  const now = Date.now();
  const halfWindow = (weeks / 2) * 7 * 24 * 60 * 60 * 1000;

  const recent = activities.filter(
    (a) => now - new Date(a.date).getTime() < halfWindow && a.averageCadence > 0,
  );
  const older = activities.filter(
    (a) => now - new Date(a.date).getTime() >= halfWindow && a.averageCadence > 0,
  );

  const avg = (arr: RunSummary[]) =>
    arr.length > 0
      ? Math.round(arr.reduce((s, a) => s + a.averageCadence, 0) / arr.length)
      : 0;

  const currentAvg = avg(recent);
  const previousAvg = avg(older);
  return {
    currentAvg,
    previousAvg,
    delta: currentAvg - previousAvg,
    runCount: activities.length,
  };
}

/** Assign a run to a pace zone */
export function getPaceZone(pace: number): PaceZone | undefined {
  return PACE_ZONES.find((z) => pace >= z.minPace && pace < z.maxPace);
}

/** Group activities by pace zone and compute per-zone stats */
export function computeZoneStats(
  activities: RunSummary[],
): Array<{
  zone: PaceZone;
  mean: number;
  min: number;
  max: number;
  count: number;
}> {
  return PACE_ZONES.map((zone) => {
    const inZone = activities.filter((a) => {
      return a.averagePace >= zone.minPace && a.averagePace < zone.maxPace && a.averageCadence > 0;
    });
    if (inZone.length === 0) {
      return { zone, mean: 0, min: 0, max: 0, count: 0 };
    }
    const cadences = inZone.map((a) => a.averageCadence);
    return {
      zone,
      mean: Math.round(cadences.reduce((s, c) => s + c, 0) / cadences.length),
      min: Math.min(...cadences),
      max: Math.max(...cadences),
      count: inZone.length,
    };
  });
}

/** Simple linear regression: y = slope * x + intercept */
export function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Convert raw stream data to overlay points for a single run */
export function toOverlayPoints(
  data: OverlayStreamData,
): OverlayPoint[] {
  const { streams } = data;
  const timeArr = streams.time ?? [];
  const distArr = streams.distance ?? [];
  const cadenceArr = streams.cadence ?? [];
  const velocityArr = streams.velocity_smooth ?? [];
  const len = timeArr.length;
  const isRunning = ["Run", "VirtualRun", "TrailRun"].includes(data.activityType);
  const points: OverlayPoint[] = [];

  for (let i = 0; i < len; i++) {
    const point: OverlayPoint = {
      distance: (distArr[i] ?? 0) / 1000,
      time: (timeArr[i] ?? 0) / 60,
    };
    if (cadenceArr[i] !== undefined) {
      point.cadence = isRunning ? cadenceArr[i]! * 2 : cadenceArr[i];
    }
    if (velocityArr[i] !== undefined) {
      const mps = velocityArr[i]!;
      point.pace = mps > 0 ? Math.min(1000 / mps / 60, 15) : 15;
    }
    points.push(point);
  }
  return points;
}

/** Apply simple moving average to overlay points */
export function smoothOverlayPoints(
  points: OverlayPoint[],
  windowSize = 30,
): OverlayPoint[] {
  const len = points.length;
  if (len < 3) return points;
  const half = Math.floor(windowSize / 2);

  return points.map((pt, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(len - 1, i + half);
    let cadSum = 0;
    let cadCount = 0;
    let paceSum = 0;
    let paceCount = 0;
    for (let j = lo; j <= hi; j++) {
      if (points[j]!.cadence !== undefined) {
        cadSum += points[j]!.cadence!;
        cadCount++;
      }
      if (points[j]!.pace !== undefined) {
        paceSum += points[j]!.pace!;
        paceCount++;
      }
    }
    return {
      distance: pt.distance,
      time: pt.time,
      cadence: cadCount > 0 ? cadSum / cadCount : pt.cadence,
      pace: paceCount > 0 ? paceSum / paceCount : pt.pace,
    };
  });
}

/** Dot size based on distance: min 4px, max 12px, scaled linearly */
export function dotSize(distanceKm: number, maxDistanceKm: number): number {
  if (maxDistanceKm <= 0) return 6;
  const ratio = Math.min(distanceKm / maxDistanceKm, 1);
  return 4 + ratio * 8;
}
```

**Step 2: Verify typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/cadence-trends/src/normalize.ts
git commit -m "feat: add normalize.ts with stats, zones, regression, overlay transforms"
```

---

## Task 5: SummaryBar and App Shell

Build the summary stats bar and the main App component with view switching.

**Files:**
- Create: `packages/cadence-trends/src/SummaryBar.tsx`
- Create: `packages/cadence-trends/src/SummaryBar.module.css`
- Create: `packages/cadence-trends/src/App.module.css`
- Modify: `packages/cadence-trends/src/App.tsx`

**Step 1: Create `packages/cadence-trends/src/SummaryBar.module.css`**

```css
.bar {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-secondary);
  font-size: var(--font-text-xs-size);
  color: var(--color-text-secondary);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label {
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}

.value {
  font-size: var(--font-text-md-size);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.delta {
  font-weight: var(--font-weight-medium);
}

.delta[data-direction="up"] {
  color: var(--color-text-success);
}

.delta[data-direction="down"] {
  color: var(--color-text-danger);
}

.delta[data-direction="flat"] {
  color: var(--color-text-tertiary);
}
```

**Step 2: Create `packages/cadence-trends/src/SummaryBar.tsx`**

```tsx
import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  currentAvg: number;
  delta: number;
  runCount: number;
  weeks: number;
}

export function SummaryBar({ currentAvg, delta, runCount, weeks }: SummaryBarProps) {
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";

  return (
    <div className={styles.bar}>
      <div className={styles.stat}>
        <span className={styles.label}>Avg Cadence</span>
        <span className={styles.value}>
          {currentAvg > 0 ? `${currentAvg} spm` : "—"}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Trend</span>
        <span className={styles.delta} data-direction={direction}>
          {delta !== 0 ? `${sign}${delta} spm` : "flat"}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Runs</span>
        <span className={styles.value}>
          {runCount} in {weeks}w
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Create `packages/cadence-trends/src/App.module.css`**

```css
.container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.nav {
  padding: 12px 16px 0;
}

.viewContainer {
  flex: 1;
  padding: 16px;
}

.selectionBar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--color-border-secondary);
  font-size: var(--font-text-xs-size);
  flex-wrap: wrap;
}

.selectedRun {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--border-radius-sm);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
}

.selectedRun button {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-tertiary);
  padding: 0 2px;
  font-size: var(--font-text-xs-size);
}
```

**Step 4: Update `packages/cadence-trends/src/App.tsx`**

```tsx
import type { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useCallback, useMemo, useState } from "react";
import { PillGroup, Pill } from "@strava-mcp/ui";
import styles from "./App.module.css";
import { SummaryBar } from "./SummaryBar";
import { computeSummaryStats, toOverlayPoints, smoothOverlayPoints } from "./normalize";
import type { CadenceTrendData, OverlayPoint, OverlayStreamData, RunSummary, ViewId } from "./types";

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "trend", label: "Trend" },
  { id: "scatter", label: "Scatter" },
  { id: "zones", label: "Zones" },
  { id: "overlay", label: "Overlay" },
];

interface AppProps {
  app: ReturnType<typeof useApp>["app"];
  data: CadenceTrendData;
}

interface CachedStream {
  run: RunSummary;
  points: OverlayPoint[];
}

export function App({ app, data }: AppProps) {
  const [activeView, setActiveView] = useState<ViewId>("trend");
  const [selectedRunIds, setSelectedRunIds] = useState<Set<number>>(new Set());
  const [streamCache, setStreamCache] = useState<Map<number, CachedStream>>(new Map());
  const [loadingStreams, setLoadingStreams] = useState<Set<number>>(new Set());

  const stats = useMemo(
    () => computeSummaryStats(data.activities, data.weeks),
    [data],
  );

  const toggleRunSelection = useCallback(
    (runId: number) => {
      setSelectedRunIds((prev) => {
        const next = new Set(prev);
        if (next.has(runId)) {
          next.delete(runId);
        } else if (next.size < 4) {
          next.add(runId);
        }
        return next;
      });
    },
    [],
  );

  const removeRun = useCallback((runId: number) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
  }, []);

  const fetchStreamForRun = useCallback(
    async (runId: number) => {
      if (!app || streamCache.has(runId) || loadingStreams.has(runId)) return;
      setLoadingStreams((prev) => new Set(prev).add(runId));
      try {
        const result: CallToolResult = await app.callServerTool({
          name: "get-activity-streams-raw",
          arguments: { activity_id: String(runId) },
        });
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (text) {
          const streamData = JSON.parse(text) as OverlayStreamData;
          const run = data.activities.find((a) => a.id === runId);
          if (run) {
            const points = smoothOverlayPoints(toOverlayPoints(streamData));
            setStreamCache((prev) => new Map(prev).set(runId, { run, points }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch streams for run", runId, err);
      } finally {
        setLoadingStreams((prev) => {
          const next = new Set(prev);
          next.delete(runId);
          return next;
        });
      }
    },
    [app, streamCache, loadingStreams, data.activities],
  );

  const selectedRuns = data.activities.filter((a) => selectedRunIds.has(a.id));

  return (
    <div className={styles.container}>
      <SummaryBar
        currentAvg={stats.currentAvg}
        delta={stats.delta}
        runCount={stats.runCount}
        weeks={data.weeks}
      />
      <div className={styles.nav}>
        <PillGroup>
          {VIEWS.map((v) => (
            <Pill
              key={v.id}
              active={activeView === v.id}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </Pill>
          ))}
        </PillGroup>
      </div>
      <div className={styles.viewContainer}>
        {activeView === "trend" && (
          <div>Trend view — {data.activities.length} runs (placeholder)</div>
        )}
        {activeView === "scatter" && (
          <div>Scatter view (placeholder)</div>
        )}
        {activeView === "zones" && (
          <div>Zones view (placeholder)</div>
        )}
        {activeView === "overlay" && (
          <div>Overlay view — {selectedRuns.length} selected (placeholder)</div>
        )}
      </div>
      {selectedRuns.length > 0 && (
        <div className={styles.selectionBar}>
          {selectedRuns.map((run) => (
            <div key={run.id} className={styles.selectedRun}>
              <span>{run.name} · {new Date(run.date).toLocaleDateString()}</span>
              <button type="button" onClick={() => removeRun(run.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Verify build and typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`
Expected: Build succeeds

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: add SummaryBar, App shell with view switching and run selection"
```

---

## Task 6: Trend View

The timeline chart showing cadence dots + pace dots + rolling average trend line.

**Files:**
- Create: `packages/cadence-trends/src/TrendView.tsx`
- Create: `packages/cadence-trends/src/TrendView.module.css`
- Create: `packages/cadence-trends/src/SharedTooltip.tsx`
- Modify: `packages/cadence-trends/src/App.tsx` (replace placeholder)

**Step 1: Create `packages/cadence-trends/src/SharedTooltip.tsx`**

Custom tooltip component shared across Trend and Scatter views:

```tsx
import { Tooltip, TooltipEntry } from "@strava-mcp/ui";
import { formatPace, formatDuration } from "./normalize";

interface RunTooltipPayloadItem {
  name?: string;
  value?: number;
  payload?: {
    name?: string;
    date?: string;
    distance?: number;
    averageCadence?: number;
    averagePace?: number;
    duration?: number;
  };
}

interface SharedTooltipProps {
  active?: boolean;
  payload?: RunTooltipPayloadItem[];
}

export function SharedTooltip({ active, payload }: SharedTooltipProps) {
  if (!active || !payload?.length) return null;
  const run = payload[0]?.payload;
  if (!run) return null;

  const date = run.date ? new Date(run.date).toLocaleDateString() : "";

  return (
    <Tooltip timestamp={date}>
      {run.name && (
        <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: 4 }}>
          {run.name}
        </div>
      )}
      {run.averageCadence !== undefined && run.averageCadence > 0 && (
        <TooltipEntry color="var(--chart-cadence)" label="Cadence" value={`${run.averageCadence}`} unit="spm" />
      )}
      {run.averagePace !== undefined && run.averagePace > 0 && (
        <TooltipEntry color="var(--chart-pace)" label="Pace" value={formatPace(run.averagePace)} unit="/km" />
      )}
      {run.distance !== undefined && (
        <TooltipEntry color="var(--color-text-tertiary)" label="Distance" value={`${run.distance}`} unit="km" />
      )}
      {run.duration !== undefined && (
        <TooltipEntry color="var(--color-text-tertiary)" label="Duration" value={formatDuration(run.duration)} unit="" />
      )}
    </Tooltip>
  );
}
```

**Step 2: Create `packages/cadence-trends/src/TrendView.module.css`**

```css
.container {
  width: 100%;
  height: 320px;
}
```

**Step 3: Create `packages/cadence-trends/src/TrendView.tsx`**

```tsx
import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { dotSize, rollingAverage } from "./normalize";
import { SharedTooltip } from "./SharedTooltip";
import type { RunSummary } from "./types";
import styles from "./TrendView.module.css";

interface TrendViewProps {
  activities: RunSummary[];
  onRunClick: (runId: number) => void;
  selectedRunIds: Set<number>;
}

export function TrendView({ activities, onRunClick, selectedRunIds }: TrendViewProps) {
  const sorted = useMemo(
    () =>
      [...activities]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .filter((a) => a.averageCadence > 0),
    [activities],
  );

  const maxDistance = useMemo(
    () => Math.max(...sorted.map((a) => a.distance), 1),
    [sorted],
  );

  const trend = useMemo(() => rollingAverage(sorted, 5), [sorted]);

  const chartData = useMemo(
    () =>
      sorted.map((a, i) => ({
        ...a,
        dateFormatted: new Date(a.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        dateTs: new Date(a.date).getTime(),
        trendCadence: trend[i]?.cadence ?? null,
        size: dotSize(a.distance, maxDistance),
      })),
    [sorted, trend, maxDistance],
  );

  if (chartData.length === 0) {
    return <div className={styles.container}>No runs with cadence data in this period.</div>;
  }

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border-secondary)" }}
          />
          <YAxis
            yAxisId="cadence"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "spm",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <YAxis
            yAxisId="pace"
            orientation="right"
            reversed
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "min/km",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <RechartsTooltip content={<SharedTooltip />} />
          <Line
            yAxisId="cadence"
            type="monotone"
            dataKey="trendCadence"
            stroke="var(--chart-cadence)"
            strokeWidth={2}
            dot={false}
            connectNulls
            strokeOpacity={0.5}
          />
          <Scatter
            yAxisId="cadence"
            dataKey="averageCadence"
            fill="var(--chart-cadence)"
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
                r={entry.size / 2}
                stroke={selectedRunIds.has(entry.id) ? "var(--color-text-primary)" : "none"}
                strokeWidth={selectedRunIds.has(entry.id) ? 2 : 0}
                onClick={() => onRunClick(entry.id)}
              />
            ))}
          </Scatter>
          <Scatter
            yAxisId="pace"
            dataKey="averagePace"
            fill="var(--chart-pace)"
            fillOpacity={0.5}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
                r={Math.max(entry.size / 2 - 1, 2)}
                onClick={() => onRunClick(entry.id)}
              />
            ))}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 4: Wire TrendView into App.tsx**

Replace the trend placeholder in `App.tsx`:

```tsx
// Add import at top
import { TrendView } from "./TrendView";

// Replace: {activeView === "trend" && ( <div>Trend view — ...</div> )}
// With:
{activeView === "trend" && (
  <TrendView
    activities={data.activities}
    onRunClick={toggleRunSelection}
    selectedRunIds={selectedRunIds}
  />
)}
```

**Step 5: Verify build and typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`
Expected: Build succeeds

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: add TrendView with cadence/pace dots and rolling average"
```

---

## Task 7: Scatter View

Scatter plot showing cadence vs pace correlation with recency-based opacity and regression line.

**Files:**
- Create: `packages/cadence-trends/src/ScatterView.tsx`
- Modify: `packages/cadence-trends/src/App.tsx` (replace placeholder)

**Step 1: Create `packages/cadence-trends/src/ScatterView.tsx`**

```tsx
import { useMemo } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { dotSize, formatPace, linearRegression } from "./normalize";
import { SharedTooltip } from "./SharedTooltip";
import type { RunSummary } from "./types";

interface ScatterViewProps {
  activities: RunSummary[];
  onRunClick: (runId: number) => void;
  selectedRunIds: Set<number>;
}

export function ScatterView({ activities, onRunClick, selectedRunIds }: ScatterViewProps) {
  const runs = useMemo(
    () => activities.filter((a) => a.averageCadence > 0 && a.averagePace > 0),
    [activities],
  );

  const maxDistance = useMemo(
    () => Math.max(...runs.map((a) => a.distance), 1),
    [runs],
  );

  const now = Date.now();
  const oldestTs = useMemo(
    () => Math.min(...runs.map((a) => new Date(a.date).getTime()), now),
    [runs, now],
  );
  const timeRange = now - oldestTs;

  const chartData = useMemo(
    () =>
      runs.map((a) => {
        const age = now - new Date(a.date).getTime();
        const recency = timeRange > 0 ? 1 - age / timeRange : 1;
        return {
          ...a,
          opacity: 0.3 + recency * 0.7,
          size: dotSize(a.distance, maxDistance),
        };
      }),
    [runs, maxDistance, now, timeRange],
  );

  const regression = useMemo(() => {
    const points = runs.map((a) => ({ x: a.averagePace, y: a.averageCadence }));
    return linearRegression(points);
  }, [runs]);

  if (chartData.length === 0) {
    return <div style={{ height: 320 }}>No runs with cadence data in this period.</div>;
  }

  const paceExtent = [
    Math.min(...runs.map((a) => a.averagePace)),
    Math.max(...runs.map((a) => a.averagePace)),
  ];

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
          <XAxis
            dataKey="averagePace"
            type="number"
            reversed
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => formatPace(v)}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border-secondary)" }}
            label={{
              value: "Pace (min/km) → faster",
              position: "insideBottom",
              offset: -4,
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <YAxis
            dataKey="averageCadence"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "spm",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <RechartsTooltip content={<SharedTooltip />} />
          {regression && (
            <ReferenceLine
              segment={[
                { x: paceExtent[0], y: regression.slope * paceExtent[0]! + regression.intercept },
                { x: paceExtent[1], y: regression.slope * paceExtent[1]! + regression.intercept },
              ]}
              stroke="var(--color-text-tertiary)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
            />
          )}
          <Scatter data={chartData} fill="var(--chart-cadence)">
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
                fillOpacity={entry.opacity}
                r={entry.size / 2}
                stroke={selectedRunIds.has(entry.id) ? "var(--color-text-primary)" : "none"}
                strokeWidth={selectedRunIds.has(entry.id) ? 2 : 0}
                onClick={() => onRunClick(entry.id)}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Wire ScatterView into App.tsx**

```tsx
// Add import
import { ScatterView } from "./ScatterView";

// Replace scatter placeholder:
{activeView === "scatter" && (
  <ScatterView
    activities={data.activities}
    onRunClick={toggleRunSelection}
    selectedRunIds={selectedRunIds}
  />
)}
```

**Step 3: Verify build and typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: add ScatterView with cadence-pace correlation and regression line"
```

---

## Task 8: Zones View

Bar chart showing average cadence per pace zone with whiskers.

**Files:**
- Create: `packages/cadence-trends/src/ZonesView.tsx`
- Modify: `packages/cadence-trends/src/App.tsx` (replace placeholder)

**Step 1: Create `packages/cadence-trends/src/ZonesView.tsx`**

```tsx
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
} from "recharts";
import { computeZoneStats } from "./normalize";
import type { RunSummary } from "./types";

interface ZonesViewProps {
  activities: RunSummary[];
}

const ZONE_OPACITIES = [1, 0.8, 0.6, 0.4];

export function ZonesView({ activities }: ZonesViewProps) {
  const zoneStats = useMemo(() => computeZoneStats(activities), [activities]);

  const chartData = useMemo(
    () =>
      zoneStats
        .filter((z) => z.count > 0)
        .map((z) => ({
          zone: z.zone.label,
          mean: z.mean,
          min: z.min,
          max: z.max,
          count: z.count,
          errorLow: z.mean - z.min,
          errorHigh: z.max - z.mean,
        })),
    [zoneStats],
  );

  if (chartData.length === 0) {
    return <div style={{ height: 320 }}>No runs with cadence data in this period.</div>;
  }

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
          <XAxis
            dataKey="zone"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border-secondary)" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "spm",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell
                key={chartData[i]!.zone}
                fill="var(--chart-cadence)"
                fillOpacity={ZONE_OPACITIES[i] ?? 0.4}
              />
            ))}
            <ErrorBar
              dataKey="errorHigh"
              direction="y"
              width={8}
              stroke="var(--color-text-tertiary)"
              strokeWidth={1.5}
            />
            <LabelList
              dataKey="count"
              position="top"
              formatter={(v: number) => `n=${v}`}
              style={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Wire ZonesView into App.tsx**

```tsx
// Add import
import { ZonesView } from "./ZonesView";

// Replace zones placeholder:
{activeView === "zones" && (
  <ZonesView activities={data.activities} />
)}
```

**Step 3: Verify build and typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: add ZonesView with pace zone bar chart and whiskers"
```

---

## Task 9: Overlay View

Multi-run per-second cadence overlay with lazy stream fetching.

**Files:**
- Create: `packages/cadence-trends/src/OverlayView.tsx`
- Create: `packages/cadence-trends/src/OverlayView.module.css`
- Modify: `packages/cadence-trends/src/App.tsx` (replace placeholder, trigger fetching)

**Step 1: Define comparison palette in `types.ts`**

Add to the end of `packages/cadence-trends/src/types.ts`:

```typescript
/** Palette for overlay comparison lines — distinct from metric colors */
export const COMPARISON_COLORS = [
  "#e11d48", // rose
  "#2563eb", // blue
  "#16a34a", // green
  "#d97706", // amber
];
```

**Step 2: Create `packages/cadence-trends/src/OverlayView.module.css`**

```css
.container {
  width: 100%;
  height: 320px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 320px;
  color: var(--color-text-tertiary);
  font-size: var(--font-text-sm-size);
}

.loading {
  color: var(--color-text-secondary);
  font-size: var(--font-text-xs-size);
  padding: 4px 0;
}
```

**Step 3: Create `packages/cadence-trends/src/OverlayView.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Legend, LegendItem } from "@strava-mcp/ui";
import type { OverlayPoint, RunSummary } from "./types";
import { COMPARISON_COLORS } from "./types";
import styles from "./OverlayView.module.css";

interface CachedStream {
  run: RunSummary;
  points: OverlayPoint[];
}

interface OverlayViewProps {
  selectedRunIds: Set<number>;
  streamCache: Map<number, CachedStream>;
  loadingStreams: Set<number>;
  fetchStreamForRun: (runId: number) => void;
}

type XMode = "distance" | "time";

export function OverlayView({
  selectedRunIds,
  streamCache,
  loadingStreams,
  fetchStreamForRun,
}: OverlayViewProps) {
  const [xMode, setXMode] = useState<XMode>("distance");
  const [hiddenRuns, setHiddenRuns] = useState<Set<number>>(new Set());

  // Trigger fetch for selected runs not yet cached
  useEffect(() => {
    for (const id of selectedRunIds) {
      if (!streamCache.has(id)) {
        fetchStreamForRun(id);
      }
    }
  }, [selectedRunIds, streamCache, fetchStreamForRun]);

  const runs = useMemo(() => {
    const entries: Array<CachedStream & { color: string }> = [];
    let colorIdx = 0;
    for (const id of selectedRunIds) {
      const cached = streamCache.get(id);
      if (cached) {
        entries.push({ ...cached, color: COMPARISON_COLORS[colorIdx % COMPARISON_COLORS.length]! });
        colorIdx++;
      }
    }
    return entries;
  }, [selectedRunIds, streamCache]);

  // Merge all runs into a unified dataset keyed by x-axis value
  const { chartData, runKeys } = useMemo(() => {
    if (runs.length === 0) return { chartData: [], runKeys: [] as string[] };

    const keys = runs.map((r) => `cadence_${r.run.id}`);

    // Find the min length across all runs for x-axis alignment
    const allPoints = runs.map((r) => r.points);
    const maxLen = Math.max(...allPoints.map((p) => p.length));

    // Sample every N points to keep chart responsive
    const step = Math.max(1, Math.floor(maxLen / 500));

    const merged: Array<Record<string, number | undefined>> = [];
    for (let i = 0; i < maxLen; i += step) {
      const row: Record<string, number | undefined> = {};
      for (let r = 0; r < runs.length; r++) {
        const pts = allPoints[r]!;
        const pt = pts[Math.min(i, pts.length - 1)];
        if (pt) {
          row.x = xMode === "distance" ? pt.distance : pt.time;
          row[keys[r]!] = pt.cadence;
        }
      }
      if (row.x !== undefined) merged.push(row);
    }

    return { chartData: merged, runKeys: keys };
  }, [runs, xMode]);

  const isLoading = [...selectedRunIds].some((id) => loadingStreams.has(id));

  if (selectedRunIds.size === 0) {
    return (
      <div className={styles.empty}>
        Click runs in Trend or Scatter view to compare them here
      </div>
    );
  }

  return (
    <div>
      {isLoading && (
        <div className={styles.loading}>Loading stream data...</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <Legend>
          {runs.map((r) => (
            <LegendItem
              key={r.run.id}
              color={r.color}
              label={`${r.run.name} · ${new Date(r.run.date).toLocaleDateString()}`}
              hidden={hiddenRuns.has(r.run.id)}
              onClick={() => {
                setHiddenRuns((prev) => {
                  const next = new Set(prev);
                  if (next.has(r.run.id)) next.delete(r.run.id);
                  else next.add(r.run.id);
                  return next;
                });
              }}
            />
          ))}
        </Legend>
        <button
          type="button"
          onClick={() => setXMode(xMode === "distance" ? "time" : "distance")}
          style={{
            border: "1px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-sm)",
            padding: "2px 8px",
            fontSize: "var(--font-text-xs-size)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          {xMode === "distance" ? "km" : "min"}
        </button>
      </div>
      <div className={styles.container}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-secondary)" }}
              label={{
                value: xMode === "distance" ? "km" : "min",
                position: "insideBottomRight",
                offset: -4,
                style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
              }}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "spm",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
              }}
            />
            <RechartsTooltip
              labelFormatter={(v: number) =>
                xMode === "distance" ? `${v.toFixed(1)} km` : `${v.toFixed(0)} min`
              }
            />
            {runs.map((r, i) => (
              <Line
                key={r.run.id}
                type="monotone"
                dataKey={runKeys[i]}
                stroke={r.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                hide={hiddenRuns.has(r.run.id)}
                name={r.run.name}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Step 4: Wire OverlayView into App.tsx**

```tsx
// Add import
import { OverlayView } from "./OverlayView";

// Replace overlay placeholder:
{activeView === "overlay" && (
  <OverlayView
    selectedRunIds={selectedRunIds}
    streamCache={streamCache}
    loadingStreams={loadingStreams}
    fetchStreamForRun={fetchStreamForRun}
  />
)}
```

**Step 5: Verify build and typecheck**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && INPUT=app.html bunx vite build`

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/packages/cadence-trends && bunx tsc --noEmit`

**Step 6: Commit**

```bash
git add packages/cadence-trends/src/
git commit -m "feat: add OverlayView with multi-run cadence comparison"
```

---

## Task 10: Full Integration Build and Test

Build everything end-to-end, run full test suite, verify lint.

**Files:**
- Modify: none (verification only)

**Step 1: Full turbo build**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bunx turbo run build`
Expected: All packages build successfully, including `cadence-trends`

**Step 2: Verify the built HTML exists**

Run: `ls -la /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends/dist/cadence-trends/app.html`
Expected: File exists

**Step 3: Run full test suite**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bunx turbo run test`
Expected: All 104 tests pass

**Step 4: Run typecheck across all packages**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bunx turbo run typecheck`
Expected: No type errors in any package

**Step 5: Run lint**

Run: `cd /Users/luke/Projects/strava-mcp/.worktrees/cadence-trends && bun run lint`
Expected: No new lint errors (pre-existing warnings OK)

**Step 6: Fix any issues found, then commit**

```bash
git add -A
git commit -m "chore: integration build verification — all passing"
```

---

## Task 11: Update CLAUDE.md

Update project documentation to include the new cadence-trends MCP App.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add cadence-trends to the Visualization Tools table**

In the `### Visualization Tools` table, add:

```markdown
| `view-cadence-trends` | Interactive cadence trends with timeline, scatter, zones, and overlay views (MCP App) |
| `get-cadence-trend-data` | Summary cadence/pace data for the cadence trends UI (app-only) |
```

**Step 2: Add a new section for the Cadence Trends MCP App**

After the `## MCP App (Activity Chart)` section, add:

```markdown
## MCP App (Cadence Trends)

The `view-cadence-trends` tool renders an interactive cadence analysis dashboard in MCP-compatible hosts.

- Uses `@modelcontextprotocol/ext-apps` SDK with React hooks (`useApp`, `useHostStyles`)
- Bundled as single HTML file via `vite-plugin-singlefile`
- Served as MCP resource at `ui://cadence-trends/app.html`
- Calls `get-cadence-trend-data` (app-only) to fetch summary data on mount
- Calls `get-activity-streams-raw` (app-only) for per-second overlay data on demand
- Four views: Trend timeline, Scatter plot, Pace Zones, Overlay comparison
```

**Step 3: Add cadence-trends Key Directory entry**

In the Key Directories section, add:

```markdown
- `packages/cadence-trends/` — React + Recharts MCP App for cadence trend analysis
```

**Step 4: Add build command**

In the Commands section under `# UI development`, add:

```markdown
cd packages/cadence-trends
INPUT=app.html bunx vite build  # Rebuild single-file HTML
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add cadence-trends MCP App to CLAUDE.md"
```
