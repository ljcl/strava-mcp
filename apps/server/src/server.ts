import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { mapActivitySegments } from "./activitySegments";
import { stravaApi } from "./fetchClient";
import {
  cumulativeDistances,
  indexAtDistance,
  nearestCoordIndex,
  type ResolvedWaypoint,
  resolveWaypoints,
  type WaypointInput,
} from "./mapAnchors";
import { decodePolyline } from "./polyline";
import { getPrompt, listPrompts } from "./prompts";
import {
  getActivityById,
  getActivityLaps,
  getActivityPhotos,
  getAllActivities as getAllActivitiesFn,
  getRouteById,
  type StravaDetailedActivity,
} from "./stravaClient";
import { READ_ONLY } from "./tools/_annotations";
import { stravaIdInput } from "./tools/_ids";
import {
  buildComparison,
  compareActivitiesTool,
} from "./tools/compareActivities";
import { createActivityTool } from "./tools/createActivity";
import { exploreSegments } from "./tools/exploreSegments";
import { exportActivityGpx } from "./tools/exportActivityGpx";
import { exportRouteGpx } from "./tools/exportRouteGpx";
import { exportRouteTcx } from "./tools/exportRouteTcx";
import { getActivityLapsTool } from "./tools/getActivityLaps";
import { getActivityPhotosTool } from "./tools/getActivityPhotos";
import { getActivityZonesTool } from "./tools/getActivityZones";
import { getAerobicAnalysisTool } from "./tools/getAerobicAnalysis";
import { getAthleteStatsTool } from "./tools/getAthleteStats";
import { getBestEffortsTool } from "./tools/getBestEfforts";
import { getFitnessTrendTool } from "./tools/getFitnessTrend";
import { getHillAnalysisTool } from "./tools/getHillAnalysis";
import { getIntervalAnalysisTool } from "./tools/getIntervalAnalysis";
import { getRouteTool } from "./tools/getRoute";
import { getRunningSummaryTool } from "./tools/getRunningSummary";
import { getSegmentTool } from "./tools/getSegment";
import { getSegmentEffortTool } from "./tools/getSegmentEffort";
import { getTrainingLoadTool } from "./tools/getTrainingLoad";
import { listAthleteRoutesTool } from "./tools/listAthleteRoutes";
import { listSegmentEffortsTool } from "./tools/listSegmentEfforts";
import { listStarredSegments } from "./tools/listStarredSegments";
import { starSegment } from "./tools/starSegment";
import { updateActivityTool } from "./tools/updateActivity";
import { buildTrainingLoadData } from "./trainingLoad";
import { SERVER_VERSION } from "./version";

const EMPTY_SCHEMA = { type: "object", properties: {}, required: [] } as const;

/**
 * Zod schemas for the MCP App tools (#107). Single source of truth: the
 * advertised JSON Schemas in buildToolDefs derive from these, and dispatch
 * validates every call against them, so a host omitting or mistyping an
 * argument gets a structured error instead of `"undefined"`/NaN flowing
 * into Strava request paths.
 */
const weeksInput = z
  .number()
  .int()
  .positive()
  .max(104)
  .default(6)
  .describe("Number of weeks of history to show (default: 6, max: 104)");

const daysInput = z
  .number()
  .int()
  .positive()
  .max(365)
  .default(84)
  .describe(
    "Number of days of history to analyze (default: 84, i.e. 12 weeks; max: 365)",
  );

const waypointsInput = z
  .array(
    z.object({
      km: z
        .number()
        .nonnegative()
        .describe(
          "Distance from the start of the track, in kilometres, where this waypoint sits.",
        ),
      label: z
        .string()
        .min(1)
        .max(120)
        .describe(
          'Short marker label shown on hover/tap, e.g. "Gel 1 (caffeinated)" or "Oxford St climb +55m".',
        ),
      kind: z
        .enum(["fuel", "climb", "water", "custom"])
        .default("custom")
        .describe(
          "Marker style: fuel (nutrition), climb (grade warning), water (drink/aid station), or custom (anything else, the default).",
        ),
    }),
  )
  .max(50)
  .optional()
  .describe(
    "Optional distance-anchored waypoints to pin along the track — e.g. fueling points or climb warnings from a race plan. " +
      "Rendered as a toggleable marker layer on the map and elevation profile. Waypoints beyond the end of the track are dropped with a warning.",
  );

const APP_TOOL_INPUT_SCHEMAS: Record<string, z.ZodType> = {
  "view-activity-chart": z.object({
    activity_id: stravaIdInput("The Strava activity ID to visualize."),
  }),
  "get-activity-streams-raw": z.object({
    activity_id: stravaIdInput("The Strava activity ID."),
  }),
  "view-cadence-trends": z.object({ weeks: weeksInput }),
  "get-cadence-trend-data": z.object({ weeks: weeksInput }),
  "view-route-map": z.object({
    activity_id: stravaIdInput("The Strava activity ID to map.").optional(),
    route_id: stravaIdInput("The Strava route ID to map.").optional(),
    waypoints: waypointsInput,
  }),
  "get-route-map-data": z.object({
    activity_id: stravaIdInput("The Strava activity ID.").optional(),
    route_id: stravaIdInput("The Strava route ID.").optional(),
    waypoints: waypointsInput,
  }),
  "view-activity-segments": z.object({
    activity_id: stravaIdInput("The Strava activity ID."),
  }),
  "get-activity-segments-data": z.object({
    activity_id: stravaIdInput("The Strava activity ID."),
  }),
  "view-training-load": z.object({ days: daysInput }),
  "get-training-load-data": z.object({ days: daysInput }),
  "view-compare-activities": z.object({
    activity_id_1: stravaIdInput(
      "First activity ID (baseline/older activity).",
    ),
    activity_id_2: stravaIdInput(
      "Second activity ID (comparison/newer activity).",
    ),
  }),
  "get-compare-activities-data": z.object({
    activity_id_1: stravaIdInput("First activity ID (baseline)."),
    activity_id_2: stravaIdInput("Second activity ID (comparison)."),
  }),
};

/**
 * Basemap spike (#60): allowlist the OpenFreeMap tile origin so the route-map
 * app can attempt an external tile fetch through the host's sandbox CSP.
 * Tiles, styles, glyphs, and sprites are all served from this one origin.
 * MapLibre loads everything via fetch (connect-src); the origin is mirrored
 * into resourceDomains in case a host routes images through img-src instead.
 * Declared once on the APP_RESOURCES entry; `appResourceMeta` emits it on
 * BOTH the resource descriptor and the ReadResource content — hosts may read
 * either.
 */
const ROUTE_MAP_CSP = {
  connectDomains: ["https://tiles.openfreemap.org"],
  resourceDomains: ["https://tiles.openfreemap.org"],
} as const;

const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

interface AppResource {
  uri: string;
  /** Human-readable resource name shown by hosts. */
  name: string;
  /** Bundled single-file HTML, resolved at startup. */
  htmlPath: string;
  /** Extra `_meta.ui` fields beyond the shared prefersBorder (e.g. csp). */
  ui?: Record<string, unknown>;
}

const appHtmlRequire = createRequire(import.meta.url);

/**
 * Every MCP App resource this server serves. ListResources and ReadResource
 * are derived from this table, so adding an app means one entry here (plus
 * the Dockerfile runner-stage COPY line). HTML paths resolve once at startup
 * via each package's `./app.html` export — works in dev (workspace symlink)
 * and in the Docker runner (pruned workspace tree with built dist/ copied in).
 */
const APP_RESOURCES: AppResource[] = [
  {
    uri: "ui://activity-chart/app.html",
    name: "Activity Chart",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/activity-chart/app.html"),
  },
  {
    uri: "ui://cadence-trends/app.html",
    name: "Cadence Trends",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/cadence-trends/app.html"),
  },
  {
    uri: "ui://route-map/app.html",
    name: "Route Map",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/route-map/app.html"),
    ui: { csp: ROUTE_MAP_CSP },
  },
  {
    uri: "ui://activity-segments/app.html",
    name: "Activity Segments",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/activity-segments/app.html"),
  },
  {
    uri: "ui://training-load/app.html",
    name: "Training Load",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/training-load/app.html"),
  },
  {
    uri: "ui://compare-activities/app.html",
    name: "Compare Activities",
    htmlPath: appHtmlRequire.resolve("@strava-mcp/compare-activities/app.html"),
  },
];

/**
 * The `_meta` every app resource carries: the apps own their card chrome
 * (`prefersBorder: false`, see the mobile conventions) plus any per-app
 * extras from the table. One builder for the descriptor and the content
 * response, so the two can never drift.
 */
function appResourceMeta(resource: AppResource): Record<string, unknown> {
  return { ui: { prefersBorder: false, ...resource.ui } };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
}

/** All existing Strava tools */
const STRAVA_TOOLS = [
  getAthleteStatsTool,
  createActivityTool,
  updateActivityTool,
  listStarredSegments,
  getSegmentTool,
  exploreSegments,
  starSegment,
  getSegmentEffortTool,
  listSegmentEffortsTool,
  listAthleteRoutesTool,
  getRouteTool,
  exportRouteGpx,
  exportRouteTcx,
  exportActivityGpx,
  getActivityZonesTool,
  getActivityLapsTool,
  getActivityPhotosTool,
  getRunningSummaryTool,
  getAerobicAnalysisTool,
  getHillAnalysisTool,
  getIntervalAnalysisTool,
  getTrainingLoadTool,
  getFitnessTrendTool,
  compareActivitiesTool,
  getBestEffortsTool,
] as const;

/** Convert existing tool definitions to low-level TOOLS array */
function buildToolDefs(): ToolDef[] {
  const defs: ToolDef[] = STRAVA_TOOLS.map((tool) => {
    const t = tool as {
      name: string;
      description: string;
      inputSchema?: z.ZodType;
      outputSchema?: z.ZodType;
      annotations?: ToolAnnotations;
    };
    const def: ToolDef = {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ? z.toJSONSchema(t.inputSchema) : EMPTY_SCHEMA,
    };
    if (t.annotations) def.annotations = t.annotations;
    if (t.outputSchema) def.outputSchema = z.toJSONSchema(t.outputSchema);
    return def;
  });

  // Add MCP App tools
  defs.push({
    name: "view-activity-chart",
    description:
      "Open an interactive chart of one activity with selectable heart rate, power, pace, altitude, cadence, and grade overlays. " +
      "Prefer this over a text summary when the user wants to see or explore how metrics change over the course of an activity. Takes the activity id.",
    inputSchema: z.toJSONSchema(APP_TOOL_INPUT_SCHEMAS["view-activity-chart"]!),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://activity-chart/app.html" },
    },
  });

  defs.push({
    name: "get-activity-streams-raw",
    description:
      "Internal data feed for the activity chart UI: returns raw per-sample arrays (time, heartrate, watts, velocity_smooth, altitude, cadence, grade_smooth, distance) as JSON for one activity. " +
      "The view-activity-chart app calls this; not intended for direct model use.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["get-activity-streams-raw"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://activity-chart/app.html",
        visibility: ["app"],
      },
    },
  });

  defs.push({
    name: "view-cadence-trends",
    description:
      "Open an interactive cadence dashboard across recent runs: trend timeline, cadence-versus-pace scatter, pace-zone breakdown, and per-run overlay comparison. " +
      "Prefer this over text when the user wants to explore cadence patterns over time. Takes a number of weeks of history.",
    inputSchema: z.toJSONSchema(APP_TOOL_INPUT_SCHEMAS["view-cadence-trends"]!),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://cadence-trends/app.html" },
    },
  });

  defs.push({
    name: "get-cadence-trend-data",
    description:
      "Internal data feed for the cadence-trends UI: returns per-run summary cadence and pace for recent running activities as JSON. " +
      "The view-cadence-trends app calls this; not intended for direct model use.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["get-cadence-trend-data"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://cadence-trends/app.html",
        visibility: ["app"],
      },
    },
  });

  defs.push({
    name: "view-route-map",
    description:
      "Open an interactive map of one activity's or saved route's GPS track, fit to bounds with start and finish markers and a distance/elevation summary. " +
      "Prefer this over a text summary when the user wants to see where an activity or route went. Takes either an activity_id or a route_id (provide exactly one). " +
      "Optionally pin distance-anchored waypoints (fueling points, climb warnings, …) along the track via the waypoints array — useful when discussing a race plan or course guide.",
    inputSchema: z.toJSONSchema(APP_TOOL_INPUT_SCHEMAS["view-route-map"]!),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://route-map/app.html" },
    },
  });

  defs.push({
    name: "get-route-map-data",
    description:
      "Internal data feed for the route-map UI: returns decoded [lat, lng] coordinates plus start/end points, distance, elevation gain, and (for activities with GPS streams) index-aligned metric streams (time, distance, altitude, heartrate, watts, velocity_smooth, grade_smooth) " +
      "and annotation anchors (lap boundaries, segment-effort spans with PR/top-10 flags, geotagged photos, caller-supplied distance-anchored waypoints) for one activity or route as JSON. " +
      "The view-route-map app calls this; not intended for direct model use.",
    inputSchema: z.toJSONSchema(APP_TOOL_INPUT_SCHEMAS["get-route-map-data"]!),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://route-map/app.html",
        visibility: ["app"],
      },
    },
  });

  defs.push({
    name: "view-activity-segments",
    description:
      "Open a prioritised, scrollable list of the segments run in one activity: your PRs and top-10s pinned on top, then every segment in run order, each with pace, grade, and expandable heart-rate, cadence, and power detail. " +
      "Prefer this over text when the user wants to review the segments in a workout. Takes the activity id.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["view-activity-segments"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://activity-segments/app.html" },
    },
  });

  defs.push({
    name: "get-activity-segments-data",
    description:
      "Internal data feed for the activity-segments UI: returns the activity's segment efforts (name, time, distance, grade, climb category, PR/top-10 ranks, HR, power, cadence) as JSON. " +
      "The view-activity-segments app calls this; not intended for direct model use.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["get-activity-segments-data"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://activity-segments/app.html",
        visibility: ["app"],
      },
    },
  });

  defs.push({
    name: "view-training-load",
    description:
      "Open an interactive training-load chart: weekly running volume bars with a rolling trend line, and injury-risk warning weeks highlighted with their reason on hover. " +
      "Prefer this over text when the user wants to see how their training volume is trending. Takes a number of days of history.",
    inputSchema: z.toJSONSchema(APP_TOOL_INPUT_SCHEMAS["view-training-load"]!),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://training-load/app.html" },
    },
  });

  defs.push({
    name: "get-training-load-data",
    description:
      "Internal data feed for the training-load UI: returns per-week running volume (distance, runs, time, elevation), a rolling trend value, and injury-risk warning flags with reasons as JSON. " +
      "The view-training-load app calls this; not intended for direct model use.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["get-training-load-data"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://training-load/app.html",
        visibility: ["app"],
      },
    },
  });

  defs.push({
    name: "view-compare-activities",
    description:
      "Open an interactive side-by-side overlay of two activities: their pace, heart rate, power, cadence, or altitude streams aligned on a shared distance or time axis, with an aggregate delta summary. " +
      "Prefer this over the text-only compare-activities when the user wants to see WHERE in the activities the difference happened. Takes both activity ids.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["view-compare-activities"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://compare-activities/app.html" },
    },
  });

  defs.push({
    name: "get-compare-activities-data",
    description:
      "Internal data feed for the compare-activities UI: returns the aggregate comparison (per-activity summaries, activity2−activity1 differences, efficiency analysis) as JSON. " +
      "The view-compare-activities app calls this alongside get-activity-streams-raw; not intended for direct model use.",
    inputSchema: z.toJSONSchema(
      APP_TOOL_INPUT_SCHEMAS["get-compare-activities-data"]!,
    ),
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://compare-activities/app.html",
        visibility: ["app"],
      },
    },
  });

  return defs;
}

export const TOOLS = buildToolDefs();

/** Map of tool name → execute function for existing Strava tools */
const TOOL_EXECUTORS = new Map<
  string,
  (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  }>
>();

for (const tool of STRAVA_TOOLS) {
  TOOL_EXECUTORS.set(
    tool.name,
    tool.execute as (args: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>,
  );
}

/** Tool name → zod input schema, enforced at dispatch time (#107). */
const TOOL_INPUT_SCHEMAS = new Map<string, z.ZodType>();
for (const tool of STRAVA_TOOLS) {
  const schema = (tool as { inputSchema?: z.ZodType }).inputSchema;
  if (schema) TOOL_INPUT_SCHEMAS.set(tool.name, schema);
}
for (const [name, schema] of Object.entries(APP_TOOL_INPUT_SCHEMAS)) {
  TOOL_INPUT_SCHEMAS.set(name, schema);
}

const RAW_STREAM_TYPES = [
  "time",
  "heartrate",
  "watts",
  "velocity_smooth",
  "altitude",
  "cadence",
  "grade_smooth",
  "distance",
] as const;

async function handleViewActivityChart(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const activityId = String(args.activity_id);
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const activity = await getActivityById(token, Number(activityId));
  const lines = [
    `Activity: ${activity.name}`,
    `Type: ${activity.type}`,
    `Distance: ${((activity.distance ?? 0) / 1000).toFixed(2)} km`,
    `Moving Time: ${Math.floor((activity.moving_time ?? 0) / 60)}min`,
    "",
    "[Interactive activity chart rendered above]",
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

async function handleGetActivityStreamsRaw(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const activityId = String(args.activity_id);
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const activity = await getActivityById(token, Number(activityId));

  const endpoint = `/activities/${activityId}/streams/${RAW_STREAM_TYPES.join(",")}?series_type=time&resolution=medium`;
  const [response, stravaLaps] = await Promise.all([
    stravaApi.get<Array<{ type: string; data: unknown[] }>>(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    getActivityLaps(token, activityId),
  ]);

  const streams: Record<string, unknown[]> = {};
  for (const stream of response.data) {
    streams[stream.type] = stream.data;
  }

  const laps = stravaLaps.map((lap) => ({
    name: lap.name,
    startIndex: lap.start_index ?? 0,
    endIndex: lap.end_index ?? 0,
    distance: lap.distance,
    elapsedTime: lap.elapsed_time,
    averageSpeed: lap.average_speed ?? null,
    averageHeartrate: lap.average_heartrate ?? null,
    lapIndex: lap.lap_index,
  }));

  const result = {
    activityId: Number(activityId),
    activityType: activity.type,
    name: activity.name,
    streams,
    laps,
  };

  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

const RUNNING_TYPES = new Set(["Run", "VirtualRun", "TrailRun"]);

async function handleGetCadenceTrendData(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const weeks = Number(args.weeks) || 6;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const after = Math.floor(
    (Date.now() - weeks * 7 * 24 * 60 * 60 * 1000) / 1000,
  );

  // getAllActivities paginates internally until the `after` window is
  // exhausted; wrapping it in a second page loop would refetch everything.
  const allActivities = await getAllActivitiesFn(token, {
    perPage: 200,
    after,
  });

  const runs = allActivities.filter((a) => a.type && RUNNING_TYPES.has(a.type));

  const activities = runs.map((a) => {
    const avgCadence = a.average_cadence ? a.average_cadence * 2 : 0;
    const avgSpeed = a.average_speed ?? 0;
    const avgPace = avgSpeed > 0 ? 1000 / avgSpeed / 60 : 0;
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
): Promise<ToolCallResult> {
  const weeks = Number(args.weeks) || 6;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

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
          runs.reduce((sum, a) => sum + (a.average_cadence ?? 0) * 2, 0) /
            runs.length,
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

/** Fetch the window of running activities the training-load feed aggregates. */
async function loadTrainingLoadRuns(token: string, days: number) {
  const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const allActivities = await getAllActivitiesFn(token, {
    perPage: 200,
    after,
  });
  return allActivities.filter((a) => a.type && RUNNING_TYPES.has(a.type));
}

async function handleGetTrainingLoadData(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const days = Number(args.days) || 84;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const runs = await loadTrainingLoadRuns(token, days);
  const result = buildTrainingLoadData(runs, days);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

async function handleViewTrainingLoad(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const days = Number(args.days) || 84;
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }

  const runs = await loadTrainingLoadRuns(token, days);
  const data = buildTrainingLoadData(runs, days);
  const warningWeeks = data.weeks.filter((w) => w.warning).length;

  const lines = [
    `Training Load (last ${days} days)`,
    `Runs: ${data.totals.runs}`,
    `Distance: ${data.totals.distanceKm} km`,
    `Warning weeks: ${warningWeeks}`,
    "",
    "[Interactive training load chart rendered above]",
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** Metric streams aligned index-for-index with `coordinates`. */
interface RouteMapStreams {
  time?: number[];
  distance?: number[];
  altitude?: number[];
  heartrate?: number[];
  watts?: number[];
  velocity_smooth?: number[];
  grade_smooth?: number[];
}

/** Annotation anchors, as indices into `coordinates`. */
interface RouteMapAnnotations {
  /** Lap boundaries (each lap's end), present when the activity has 2+ laps. */
  laps?: Array<{ lapIndex: number; name: string; endIndex: number }>;
  /** Segment efforts with their track spans and notable-result flags. */
  segments?: Array<{
    name: string;
    startIndex: number;
    endIndex: number;
    /** Effort distance in metres; drives outline selection and the tooltip. */
    distanceMeters: number;
    isPr: boolean;
    isTop10: boolean;
  }>;
  /** Geotagged photos snapped to the nearest track point. */
  photos?: Array<{ index: number; caption: string | null }>;
  /** Caller-supplied waypoints anchored by cumulative distance. */
  waypoints?: ResolvedWaypoint[];
}

interface RouteMapData {
  source: "activity" | "route";
  id: string;
  name: string;
  activityType: string | null;
  distance: number;
  elevationGain: number;
  coordinates: Array<[number, number]>;
  start: [number, number] | null;
  end: [number, number] | null;
  streams?: RouteMapStreams;
  annotations?: RouteMapAnnotations;
  /** Human-readable notes about waypoints that could not be placed. */
  waypointWarnings?: string[];
}

const ROUTE_MAP_METRIC_STREAM_KEYS = [
  "time",
  "distance",
  "altitude",
  "heartrate",
  "watts",
  "velocity_smooth",
  "grade_smooth",
] as const;

/**
 * Fetch the latlng stream plus metric streams for an activity. All streams in
 * one Strava response share the same sample index, so latlng[i] lines up with
 * heartrate[i] etc. — the app can color the track without resampling. Returns
 * null when the activity has no GPS stream (the caller falls back to the
 * encoded polyline, which has no aligned metrics).
 */
async function loadActivityMapStreams(
  token: string,
  activityId: string,
): Promise<{
  coordinates: Array<[number, number]>;
  streams: RouteMapStreams;
} | null> {
  try {
    const types = ["latlng", ...ROUTE_MAP_METRIC_STREAM_KEYS].join(",");
    const endpoint = `/activities/${activityId}/streams/${types}?series_type=time&resolution=medium`;
    const response = await stravaApi.get<
      Array<{ type: string; data: unknown[] }>
    >(endpoint, { headers: { Authorization: `Bearer ${token}` } });

    const byType = new Map(response.data.map((s) => [s.type, s.data]));
    const latlng = byType.get("latlng") as Array<[number, number]> | undefined;
    if (!latlng || latlng.length === 0) return null;

    const streams: RouteMapStreams = {};
    for (const key of ROUTE_MAP_METRIC_STREAM_KEYS) {
      const data = byType.get(key);
      // Only forward streams that align with the coordinates; a mismatched
      // length would color the wrong part of the track.
      if (Array.isArray(data) && data.length === latlng.length) {
        streams[key] = data as number[];
      }
    }
    return { coordinates: latlng, streams };
  } catch {
    // Streams are an enhancement: activities without GPS (or transient stream
    // errors) still render from the polyline.
    return null;
  }
}

/** 1 = ride, 2 = run in Strava's route `type` enum. */
function routeTypeLabel(type: number): string {
  return type === 2 ? "Run" : "Ride";
}

/**
 * Anchor caller-supplied waypoints onto the loaded geometry, in place. Uses
 * the recorded distance stream when present; polyline-fallback activities and
 * saved routes get a synthetic haversine cumulative stream, so waypoints work
 * for both `activity_id` and `route_id` inputs. Out-of-range waypoints become
 * a `waypointWarnings` note (surfaced by the view tool's text) instead of an
 * error or an off-track marker.
 */
function attachWaypoints(
  data: RouteMapData,
  waypoints: WaypointInput[] | undefined,
): RouteMapData {
  if (!waypoints || waypoints.length === 0) return data;
  if (data.coordinates.length === 0) return data;

  const recorded = data.streams?.distance;
  const distanceStream =
    recorded && recorded.length === data.coordinates.length
      ? recorded
      : cumulativeDistances(data.coordinates);
  const { resolved, dropped } = resolveWaypoints(
    waypoints,
    distanceStream,
    data.distance,
  );

  if (resolved.length > 0) {
    data.annotations = { ...data.annotations, waypoints: resolved };
  }
  if (dropped.length > 0) {
    const labels = dropped.map((w) => `"${w.label}" (${w.km} km)`).join(", ");
    data.waypointWarnings = [
      `Dropped ${dropped.length} waypoint${dropped.length === 1 ? "" : "s"} beyond the ${(data.distance / 1000).toFixed(1)} km track: ${labels}.`,
    ];
  }
  return data;
}

/**
 * Resolve an activity_id or route_id into a decoded, render-ready payload.
 * Geometry arrives only as a Google encoded polyline, so we decode here (next
 * to the zod schemas and unit tests) and hand the app plain [lat, lng] pairs.
 */
async function loadRouteMapData(
  args: Record<string, unknown>,
  token: string,
  options: { includeStreams?: boolean } = {},
): Promise<RouteMapData> {
  return attachWaypoints(
    await loadRouteMapGeometry(args, token, options),
    args.waypoints as WaypointInput[] | undefined,
  );
}

/** The geometry + annotation half of `loadRouteMapData` (pre-waypoints). */
async function loadRouteMapGeometry(
  args: Record<string, unknown>,
  token: string,
  options: { includeStreams?: boolean } = {},
): Promise<RouteMapData> {
  const activityId = args.activity_id ? String(args.activity_id) : undefined;
  const routeId = args.route_id ? String(args.route_id) : undefined;

  if (!activityId && !routeId) {
    throw new Error("Provide either activity_id or route_id.");
  }

  if (activityId) {
    const [activity, streamData] = await Promise.all([
      getActivityById(token, activityId),
      options.includeStreams
        ? loadActivityMapStreams(token, activityId)
        : Promise.resolve(null),
    ]);
    // Prefer the latlng stream over the polyline: it is index-aligned with
    // the metric streams, so the app can color the track by them.
    if (streamData) {
      const annotations = await loadRouteMapAnnotations(
        token,
        activityId,
        activity,
        streamData.coordinates,
        streamData.streams.distance,
      );
      return {
        source: "activity",
        id: String(activity.id),
        name: activity.name,
        activityType: activity.type ?? null,
        distance: activity.distance ?? 0,
        elevationGain: activity.total_elevation_gain ?? 0,
        coordinates: streamData.coordinates,
        start: streamData.coordinates[0] ?? null,
        end: streamData.coordinates[streamData.coordinates.length - 1] ?? null,
        streams: streamData.streams,
        annotations,
      };
    }
    const encoded =
      activity.map?.polyline || activity.map?.summary_polyline || "";
    const coordinates = decodePolyline(encoded);
    return {
      source: "activity",
      id: String(activity.id),
      name: activity.name,
      activityType: activity.type ?? null,
      distance: activity.distance ?? 0,
      elevationGain: activity.total_elevation_gain ?? 0,
      coordinates,
      start: coordinates[0] ?? null,
      end: coordinates[coordinates.length - 1] ?? null,
    };
  }

  const route = await getRouteById(token, routeId as string);
  const encoded = route.map?.polyline || route.map?.summary_polyline || "";
  const coordinates = decodePolyline(encoded);
  return {
    source: "route",
    id: String(route.id),
    name: route.name,
    activityType: routeTypeLabel(route.type),
    distance: route.distance,
    elevationGain: route.elevation_gain ?? 0,
    coordinates,
    start: coordinates[0] ?? null,
    end: coordinates[coordinates.length - 1] ?? null,
  };
}

/**
 * Bound the segment payload; notable efforts win when an activity has more.
 * Generous because the app draws outlines for only a lean subset (PRs + the
 * longest few) but lists every covering segment in the scrub tooltip, so the
 * mini-segments between the big ones must survive into the payload.
 */
const MAX_SEGMENT_ANNOTATIONS = 60;

/**
 * Resolve lap boundaries, segment efforts, and geotagged photos into indices
 * on the (downsampled) coordinate stream. Each layer degrades independently:
 * a failed laps or photos fetch, or efforts without lat/lng, simply drop that
 * layer rather than failing the map.
 */
async function loadRouteMapAnnotations(
  token: string,
  activityId: string,
  activity: StravaDetailedActivity,
  coordinates: Array<[number, number]>,
  distanceStream: number[] | undefined,
): Promise<RouteMapAnnotations | undefined> {
  const annotations: RouteMapAnnotations = {};

  // Laps: anchor each lap's end by cumulative distance. Strava's lap
  // start/end indices refer to the full-resolution stream, so they cannot be
  // used against the medium-resolution coordinates. A single-lap activity
  // gets no markers (the whole track is one lap); the final lap's end is the
  // finish marker, so it is skipped too.
  if (distanceStream && distanceStream.length === coordinates.length) {
    try {
      const laps = await getActivityLaps(token, activityId);
      if (laps.length >= 2) {
        let cumulative = 0;
        const lapMarkers = [];
        for (const lap of laps.slice(0, -1)) {
          cumulative += lap.distance;
          const endIndex = indexAtDistance(distanceStream, cumulative);
          if (endIndex >= 0) {
            lapMarkers.push({
              lapIndex: lap.lap_index,
              name: lap.name,
              endIndex,
            });
          }
        }
        if (lapMarkers.length > 0) annotations.laps = lapMarkers;
      }
    } catch {
      // Lap layer is optional.
    }
  }

  // Segment efforts: anchor by the segment's start/end lat/lng (already on
  // the detailed activity — no extra fetch).
  const efforts = activity.segment_efforts ?? [];
  const segmentMarkers = [];
  for (const effort of efforts) {
    const startLatLng = effort.segment?.start_latlng;
    const endLatLng = effort.segment?.end_latlng;
    if (
      !startLatLng ||
      startLatLng.length < 2 ||
      !endLatLng ||
      endLatLng.length < 2
    ) {
      continue;
    }
    const startIndex = nearestCoordIndex(
      coordinates,
      startLatLng[0]!,
      startLatLng[1]!,
    );
    const endIndex = nearestCoordIndex(
      coordinates,
      endLatLng[0]!,
      endLatLng[1]!,
    );
    if (startIndex < 0 || endIndex <= startIndex) continue;
    segmentMarkers.push({
      name: effort.name,
      startIndex,
      endIndex,
      distanceMeters: effort.distance,
      isPr: effort.pr_rank != null,
      isTop10: effort.kom_rank != null,
    });
  }
  if (segmentMarkers.length > 0) {
    segmentMarkers.sort((a, b) => {
      const notable = (s: { isPr: boolean; isTop10: boolean }) =>
        (s.isPr ? 2 : 0) + (s.isTop10 ? 1 : 0);
      return notable(b) - notable(a) || a.startIndex - b.startIndex;
    });
    annotations.segments = segmentMarkers.slice(0, MAX_SEGMENT_ANNOTATIONS);
  }

  // Photos: only those with GPS coordinates.
  try {
    const photos = await getActivityPhotos(token, Number(activityId));
    const photoMarkers = [];
    for (const photo of photos) {
      const location = photo.location;
      if (!location || location.length < 2) continue;
      const index = nearestCoordIndex(coordinates, location[0]!, location[1]!);
      if (index < 0) continue;
      photoMarkers.push({ index, caption: photo.caption ?? null });
    }
    if (photoMarkers.length > 0) annotations.photos = photoMarkers;
  } catch {
    // Photo layer is optional.
  }

  return Object.keys(annotations).length > 0 ? annotations : undefined;
}

async function handleGetRouteMapData(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadRouteMapData(args, token, { includeStreams: true });
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function handleViewRouteMap(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadRouteMapData(args, token);
  const lines = [
    `${data.source === "route" ? "Route" : "Activity"}: ${data.name}`,
    `Distance: ${(data.distance / 1000).toFixed(2)} km`,
    `Elevation gain: ${Math.round(data.elevationGain)} m`,
  ];
  if (data.coordinates.length === 0) {
    lines.push("No GPS track is available, so the map will be empty.");
  }
  const waypointCount = data.annotations?.waypoints?.length ?? 0;
  if (waypointCount > 0) {
    lines.push(
      `Waypoints: ${waypointCount} pinned along the track (toggleable via the map legend).`,
    );
  }
  for (const warning of data.waypointWarnings ?? []) {
    lines.push(`Warning: ${warning}`);
  }
  lines.push("", "[Interactive route map rendered above]");
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Resolve an activity_id into the flattened segment-effort payload. Reuses the
 * detailed-activity fetch (efforts ride along on it) and the pure mapper, so
 * there is no extra network call beyond `getActivityById`.
 */
async function loadActivitySegmentsData(
  args: Record<string, unknown>,
  token: string,
): Promise<ReturnType<typeof mapActivitySegments>> {
  const activityId = args.activity_id ? String(args.activity_id) : undefined;
  if (!activityId) {
    throw new Error("Provide an activity_id.");
  }
  const activity = await getActivityById(token, activityId);
  return mapActivitySegments(activity);
}

async function handleGetActivitySegmentsData(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadActivitySegmentsData(args, token);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function handleViewActivitySegments(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadActivitySegmentsData(args, token);
  const prCount = data.segments.filter((s) => s.prRank != null).length;
  const top10Count = data.segments.filter((s) => s.komRank != null).length;
  const lines = [
    `Activity: ${data.name}`,
    `Segments: ${data.segments.length}`,
    `PRs: ${prCount}, top-10s: ${top10Count}`,
    "",
    "[Interactive segment list rendered above]",
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Fetch both detailed activities and run the same aggregate comparison the
 * compare-activities text tool uses. getActivityById is TTL-cached in
 * fetchClient, so the view + data-tool pair costs one Strava fetch per
 * activity, not two.
 */
async function loadCompareActivitiesData(
  args: Record<string, unknown>,
  token: string,
): Promise<ReturnType<typeof buildComparison>> {
  const [activity1, activity2] = await Promise.all([
    getActivityById(token, String(args.activity_id_1)),
    getActivityById(token, String(args.activity_id_2)),
  ]);
  return buildComparison(activity1, activity2);
}

async function handleGetCompareActivitiesData(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadCompareActivitiesData(args, token);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function handleViewCompareActivities(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
      isError: true,
      content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }],
    };
  }
  const data = await loadCompareActivitiesData(args, token);
  const lines = [
    `Activity 1: ${data.activity_1.name} (${data.activity_1.date}) — ${data.activity_1.distance_km} km in ${data.activity_1.time_formatted}`,
    `Activity 2: ${data.activity_2.name} (${data.activity_2.date}) — ${data.activity_2.distance_km} km in ${data.activity_2.time_formatted}`,
  ];
  if (data.differences.pace) {
    const s = data.differences.pace.seconds_per_km;
    lines.push(
      `Pace delta: ${s > 0 ? "+" : ""}${s} sec/km (${data.differences.pace.interpretation})`,
    );
  }
  if (data.differences.avg_hr != null) {
    lines.push(
      `Avg HR delta: ${data.differences.avg_hr > 0 ? "+" : ""}${data.differences.avg_hr} bpm`,
    );
  }
  for (const warning of data.warnings ?? []) {
    lines.push(`Warning: ${warning}`);
  }
  lines.push("", "[Interactive activity comparison rendered above]");
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

interface ToolCallResult {
  // Index signature keeps this assignable to the SDK's ServerResult union.
  [key: string]: unknown;
  content: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** MCP App tool name → handler (same dispatch path as the Strava tools). */
const APP_TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>) => Promise<ToolCallResult>
> = {
  "view-activity-chart": handleViewActivityChart,
  "get-activity-streams-raw": handleGetActivityStreamsRaw,
  "view-cadence-trends": handleViewCadenceTrends,
  "get-cadence-trend-data": handleGetCadenceTrendData,
  "view-route-map": handleViewRouteMap,
  "get-route-map-data": handleGetRouteMapData,
  "view-activity-segments": handleViewActivitySegments,
  "get-activity-segments-data": handleGetActivitySegmentsData,
  "view-training-load": handleViewTrainingLoad,
  "get-training-load-data": handleGetTrainingLoadData,
  "view-compare-activities": handleViewCompareActivities,
  "get-compare-activities-data": handleGetCompareActivitiesData,
};

/**
 * Single dispatch path for every tool call. Validates the raw host args
 * against the tool's zod schema BEFORE executing (#107), so defaults always
 * apply and invalid types surface as a structured error instead of flowing
 * into Strava URLs and math as `"undefined"` or NaN.
 */
export async function dispatchToolCall(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<ToolCallResult> {
  const handler = APP_TOOL_HANDLERS[name] ?? TOOL_EXECUTORS.get(name);
  if (!handler) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  let args: Record<string, unknown> = rawArgs ?? {};
  const schema = TOOL_INPUT_SCHEMAS.get(name);
  if (schema) {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`,
          },
        ],
      };
    }
    args = parsed.data as Record<string, unknown>;
  }

  try {
    return await handler(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Tool error: ${message}` }],
    };
  }
}

export function createServer(): Server {
  const server = new Server(
    { name: "Strava MCP Server", version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    getPrompt(request.params.name, request.params.arguments),
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return dispatchToolCall(name, args);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: APP_RESOURCES.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      mimeType: MCP_APP_MIME_TYPE,
      _meta: appResourceMeta(resource),
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const resource = APP_RESOURCES.find((r) => r.uri === uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    const html = await fs.readFile(resource.htmlPath, "utf-8");
    return {
      contents: [
        {
          uri,
          mimeType: MCP_APP_MIME_TYPE,
          text: html,
          _meta: appResourceMeta(resource),
        },
      ],
    };
  });

  return server;
}
