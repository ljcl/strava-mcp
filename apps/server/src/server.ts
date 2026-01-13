import fs from "node:fs/promises";
import path from "node:path";
// biome-ignore lint/nursery/noDeprecatedImports: Low-level Server API required for _meta.ui support on tools
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { stravaApi } from "./fetchClient";
import { getActivityById, getActivityLaps } from "./stravaClient";
import { compareActivitiesTool } from "./tools/compareActivities";
import { exploreSegments } from "./tools/exploreSegments";
import { exportRouteGpx } from "./tools/exportRouteGpx";
import { exportRouteTcx } from "./tools/exportRouteTcx";
import { getActivityDetailsTool } from "./tools/getActivityDetails";
import { getActivityLapsTool } from "./tools/getActivityLaps";
import { getActivityPhotosTool } from "./tools/getActivityPhotos";
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
import { listSegmentEffortsTool } from "./tools/listSegmentEfforts";
import { listStarredSegments } from "./tools/listStarredSegments";
import { starSegment } from "./tools/starSegment";

const EMPTY_SCHEMA = { type: "object", properties: {}, required: [] } as const;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

/** All existing Strava tools */
const STRAVA_TOOLS = [
  getAthleteProfile,
  getAthleteStatsTool,
  getActivityDetailsTool,
  getRecentActivities,
  listAthleteClubs,
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
  const defs: ToolDef[] = STRAVA_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
      ? z.toJSONSchema(tool.inputSchema)
      : EMPTY_SCHEMA,
  }));

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

  return defs;
}

const TOOLS = buildToolDefs();

/** Map of tool name → execute function for existing Strava tools */
const TOOL_EXECUTORS = new Map<
  string,
  (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
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

  const endpoint = `/activities/${activityId}/streams/${RAW_STREAM_TYPES.join(",")}?series_type=time`;
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
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === "ui://activity-chart/app.html") {
      const htmlPath = path.join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "dist",
        "activity-chart",
        "app.html",
      );
      const html = await fs.readFile(htmlPath, "utf-8");
      return {
        contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: html }],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}
