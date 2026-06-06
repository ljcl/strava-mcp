import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { stravaApi } from "./fetchClient";
import {
  getActivityById,
  getActivityLaps,
  getAllActivities as getAllActivitiesFn,
} from "./stravaClient";
import { compareActivitiesTool } from "./tools/compareActivities";
import { exploreSegments } from "./tools/exploreSegments";
import { exportRouteGpx } from "./tools/exportRouteGpx";
import { exportRouteTcx } from "./tools/exportRouteTcx";
import { getActivityDetailsTool } from "./tools/getActivityDetails";
import { getActivityLapsTool } from "./tools/getActivityLaps";
import { getActivityPhotosTool } from "./tools/getActivityPhotos";
import { getActivitySegmentEffortsTool } from "./tools/getActivitySegmentEfforts";
import { getActivityStreamsTool } from "./tools/getActivityStreams";
import { getAllActivities } from "./tools/getAllActivities";
import { getAthleteProfile } from "./tools/getAthleteProfile";
import { getAthleteStatsTool } from "./tools/getAthleteStats";
import { getAthleteZonesTool } from "./tools/getAthleteZones";
import { getBestEffortsTool } from "./tools/getBestEfforts";
import { getRecentActivities } from "./tools/getRecentActivities";
import { getRouteTool } from "./tools/getRoute";
import { getRunningSummaryTool } from "./tools/getRunningSummary";
import { getSegmentTool } from "./tools/getSegment";
import { getSegmentEffortTool } from "./tools/getSegmentEffort";
import { getTrainingLoadTool } from "./tools/getTrainingLoad";
import { listAthleteClubs } from "./tools/listAthleteClubs";
import { listAthleteRoutesTool } from "./tools/listAthleteRoutes";
import { listGearTool } from "./tools/listGear";
import { listSegmentEffortsTool } from "./tools/listSegmentEfforts";
import { listStarredSegments } from "./tools/listStarredSegments";
import { starSegment } from "./tools/starSegment";
import { updateActivityTool } from "./tools/updateActivity";

const EMPTY_SCHEMA = { type: "object", properties: {}, required: [] } as const;

/**
 * MCP App HTML paths resolved once at startup via each package's `./app.html`
 * export. Works in dev (workspace symlink) and in the Docker runner (pruned
 * workspace tree with built dist/ copied in).
 */
const ACTIVITY_CHART_HTML_PATH = createRequire(import.meta.url).resolve(
  "@strava-mcp/activity-chart/app.html",
);
const CADENCE_TRENDS_HTML_PATH = createRequire(import.meta.url).resolve(
  "@strava-mcp/cadence-trends/app.html",
);

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
  getAthleteProfile,
  listGearTool,
  getAthleteStatsTool,
  getActivityDetailsTool,
  updateActivityTool,
  getRecentActivities,
  listAthleteClubs,
  listStarredSegments,
  getSegmentTool,
  exploreSegments,
  starSegment,
  getSegmentEffortTool,
  listSegmentEffortsTool,
  getActivitySegmentEffortsTool,
  listAthleteRoutesTool,
  getRouteTool,
  exportRouteGpx,
  exportRouteTcx,
  getActivityStreamsTool,
  getActivityLapsTool,
  getAthleteZonesTool,
  getAllActivities,
  getActivityPhotosTool,
  getRunningSummaryTool,
  getTrainingLoadTool,
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
      "Renders an interactive activity chart showing heart rate, power, pace, altitude, cadence, and grade over time. " +
      "Useful for visualizing workout metrics and analyzing activity performance.",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The Strava activity ID to visualize",
        },
      },
      required: ["activity_id"],
    },
    _meta: {
      ui: { resourceUri: "ui://activity-chart/app.html" },
    },
  });

  defs.push({
    name: "get-activity-streams-raw",
    description:
      "Get raw activity stream data as JSON for the activity chart UI. " +
      "Returns time, heartrate, watts, velocity_smooth, altitude, cadence, and grade_smooth arrays.",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The Strava activity ID",
        },
      },
      required: ["activity_id"],
    },
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

  return defs;
}

const TOOLS = buildToolDefs();

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
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const activityId = String(args.activity_id);
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
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
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const activityId = String(args.activity_id);
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return {
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

  const allActivities: Awaited<ReturnType<typeof getAllActivitiesFn>> = [];
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

export function createServer(): Server {
  const server = new Server(
    { name: "Strava MCP Server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle MCP App tools
    if (name === "view-activity-chart") {
      try {
        return await handleViewActivityChart(args ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Tool error: ${message}` }],
        };
      }
    }

    if (name === "get-activity-streams-raw") {
      try {
        return await handleGetActivityStreamsRaw(args ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Tool error: ${message}` }],
        };
      }
    }

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

    // Handle existing Strava tools
    const executor = TOOL_EXECUTORS.get(name);
    if (!executor) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }

    try {
      return await executor(args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Tool error: ${message}` }],
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "ui://activity-chart/app.html",
        name: "Activity Chart",
        mimeType: "text/html;profile=mcp-app",
        _meta: { ui: { prefersBorder: false } },
      },
      {
        uri: "ui://cadence-trends/app.html",
        name: "Cadence Trends",
        mimeType: "text/html;profile=mcp-app",
        _meta: { ui: { prefersBorder: false } },
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === "ui://activity-chart/app.html") {
      const html = await fs.readFile(ACTIVITY_CHART_HTML_PATH, "utf-8");
      return {
        contents: [
          {
            uri,
            mimeType: "text/html;profile=mcp-app",
            text: html,
            _meta: { ui: { prefersBorder: false } },
          },
        ],
      };
    }
    if (uri === "ui://cadence-trends/app.html") {
      const html = await fs.readFile(CADENCE_TRENDS_HTML_PATH, "utf-8");
      return {
        contents: [
          {
            uri,
            mimeType: "text/html;profile=mcp-app",
            text: html,
            _meta: { ui: { prefersBorder: false } },
          },
        ],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}
