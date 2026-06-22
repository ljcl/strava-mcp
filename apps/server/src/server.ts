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
import { indexAtDistance, nearestCoordIndex } from "./mapAnchors";
import { decodePolyline } from "./polyline";
import {
  getActivityById,
  getActivityLaps,
  getActivityPhotos,
  getAllActivities as getAllActivitiesFn,
  getRouteById,
  type StravaDetailedActivity,
} from "./stravaClient";
import { READ_ONLY } from "./tools/_annotations";
import { compareActivitiesTool } from "./tools/compareActivities";
import { exploreSegments } from "./tools/exploreSegments";
import { exportRouteGpx } from "./tools/exportRouteGpx";
import { exportRouteTcx } from "./tools/exportRouteTcx";
import { getActivityPhotosTool } from "./tools/getActivityPhotos";
import { getActivityZonesTool } from "./tools/getActivityZones";
import { getAthleteStatsTool } from "./tools/getAthleteStats";
import { getBestEffortsTool } from "./tools/getBestEfforts";
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
const ROUTE_MAP_HTML_PATH = createRequire(import.meta.url).resolve(
  "@strava-mcp/route-map/app.html",
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
  getAthleteStatsTool,
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
  getActivityZonesTool,
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
      "Open an interactive chart of one activity with selectable heart rate, power, pace, altitude, cadence, and grade overlays. " +
      "Prefer this over a text summary when the user wants to see or explore how metrics change over the course of an activity. Takes the activity id.",
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
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks of history to show (default: 6)",
        },
      },
    },
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
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks of history (default: 6)",
        },
      },
    },
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
      "Prefer this over a text summary when the user wants to see where an activity or route went. Takes either an activity_id or a route_id (provide exactly one).",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The Strava activity ID to map",
        },
        route_id: {
          type: "string",
          description: "The Strava route ID to map",
        },
      },
    },
    annotations: READ_ONLY,
    _meta: {
      ui: { resourceUri: "ui://route-map/app.html" },
    },
  });

  defs.push({
    name: "get-route-map-data",
    description:
      "Internal data feed for the route-map UI: returns decoded [lat, lng] coordinates plus start/end points, distance, elevation gain, and (for activities with GPS streams) index-aligned metric streams (time, distance, altitude, heartrate, watts, velocity_smooth, grade_smooth) " +
      "and annotation anchors (lap boundaries, segment-effort spans with PR/top-10 flags, geotagged photos) for one activity or route as JSON. " +
      "The view-route-map app calls this; not intended for direct model use.",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The Strava activity ID",
        },
        route_id: {
          type: "string",
          description: "The Strava route ID",
        },
      },
    },
    annotations: READ_ONLY,
    _meta: {
      ui: {
        resourceUri: "ui://route-map/app.html",
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
    isPr: boolean;
    isTop10: boolean;
  }>;
  /** Geotagged photos snapped to the nearest track point. */
  photos?: Array<{ index: number; caption: string | null }>;
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
 * Resolve an activity_id or route_id into a decoded, render-ready payload.
 * Geometry arrives only as a Google encoded polyline, so we decode here (next
 * to the zod schemas and unit tests) and hand the app plain [lat, lng] pairs.
 */
async function loadRouteMapData(
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

/** Bound the segment payload; notable efforts win when an activity has more. */
const MAX_SEGMENT_ANNOTATIONS = 25;

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
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return { content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }] };
  }
  const data = await loadRouteMapData(args, token, { includeStreams: true });
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function handleViewRouteMap(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const token = process.env.STRAVA_ACCESS_TOKEN;
  if (!token) {
    return { content: [{ type: "text", text: "Missing STRAVA_ACCESS_TOKEN" }] };
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
  lines.push("", "[Interactive route map rendered above]");
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Basemap spike (#60): allowlist the OpenFreeMap tile origin so the route-map
 * app can attempt an external tile fetch through the host's sandbox CSP.
 * Tiles, styles, glyphs, and sprites are all served from this one origin.
 * MapLibre loads everything via fetch (connect-src); the origin is mirrored
 * into resourceDomains in case a host routes images through img-src instead.
 * Declared on BOTH the resource descriptor and the ReadResource content —
 * hosts may read either.
 */
const ROUTE_MAP_CSP = {
  connectDomains: ["https://tiles.openfreemap.org"],
  resourceDomains: ["https://tiles.openfreemap.org"],
} as const;

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

    if (name === "view-route-map") {
      try {
        return await handleViewRouteMap(args ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Tool error: ${message}` }],
        };
      }
    }

    if (name === "get-route-map-data") {
      try {
        return await handleGetRouteMapData(args ?? {});
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
      {
        uri: "ui://route-map/app.html",
        name: "Route Map",
        mimeType: "text/html;profile=mcp-app",
        _meta: { ui: { prefersBorder: false, csp: ROUTE_MAP_CSP } },
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
    if (uri === "ui://route-map/app.html") {
      const html = await fs.readFile(ROUTE_MAP_HTML_PATH, "utf-8");
      return {
        contents: [
          {
            uri,
            mimeType: "text/html;profile=mcp-app",
            text: html,
            _meta: { ui: { prefersBorder: false, csp: ROUTE_MAP_CSP } },
          },
        ],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}
