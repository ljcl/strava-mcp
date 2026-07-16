/** Whether the rendered path came from an activity or a saved route. */
export type RouteMapSource = "activity" | "route";

/**
 * Metric streams aligned index-for-index with `coordinates`. Present only when
 * the server sourced the coordinates from the activity's latlng stream (all
 * streams in one Strava response share the same sample index). Keys mirror
 * Strava's stream type names.
 */
export interface RouteStreams {
  /** Seconds since activity start. */
  time?: number[];
  /** Cumulative metres. */
  distance?: number[];
  /** Metres above sea level. */
  altitude?: number[];
  /** Beats per minute. */
  heartrate?: number[];
  /** Power in watts. */
  watts?: number[];
  /** Smoothed speed in m/s. */
  velocity_smooth?: number[];
  /** Smoothed grade in percent. */
  grade_smooth?: number[];
}

/**
 * Payload returned by the app-only `get-route-map-data` tool. Coordinates are
 * decoded server-side from Strava's encoded polyline into `[lat, lng]` pairs;
 * the app never decodes, keeping the bundle lean.
 */
export interface RouteMapData {
  source: RouteMapSource;
  id: string;
  name: string;
  /** Activity type ("Run", "Ride", …) or route discipline ("Run"/"Ride"). */
  activityType: string | null;
  /** Total distance in metres. */
  distance: number;
  /** Total elevation gain in metres. */
  elevationGain: number;
  /** Ordered `[lat, lng]` pairs tracing the path. */
  coordinates: Array<[number, number]>;
  /** First point of the path, or null when there is no geometry. */
  start: [number, number] | null;
  /** Last point of the path, or null when there is no geometry. */
  end: [number, number] | null;
  /** Metric streams aligned with `coordinates`; absent for saved routes and
   * activities without GPS streams. */
  streams?: RouteStreams;
  /** Annotation anchors resolved server-side. Laps, segments, and photos need
   * stream data; waypoints resolve for any geometry (routes included). */
  annotations?: RouteAnnotations;
  /** Server notes about caller-supplied waypoints that could not be placed
   * (e.g. beyond the track length). Informational; the view tool's text
   * surfaces them to the model. */
  waypointWarnings?: string[];
}

/**
 * Annotation anchors, as indices into `coordinates`. Resolved server-side
 * (lap distances and segment/photo lat/lng mapped onto the downsampled
 * stream) so the app only projects and renders.
 */
export interface RouteAnnotations {
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
  /** Caller-supplied waypoints anchored by cumulative distance, sorted by
   * km. Unlike the other layers these resolve for saved routes too (the
   * server synthesises a cumulative-distance stream from the geometry). */
  waypoints?: Array<{
    index: number;
    /** Distance from the start, in kilometres, as supplied by the caller. */
    km: number;
    label: string;
    kind: WaypointKind;
  }>;
}

/** Marker styles a waypoint can request; the server defaults to `custom`. */
export type WaypointKind = "fuel" | "climb" | "water" | "custom";

/** A waypoint as supplied on the `view-route-map` tool input. */
export interface WaypointArg {
  km: number;
  label: string;
  kind?: WaypointKind;
}

/** Tool input for `view-route-map`: exactly one id is provided. Waypoints
 * ride along unchanged so `get-route-map-data` can anchor them. */
export interface ToolArgs {
  activity_id?: string;
  route_id?: string;
  waypoints?: WaypointArg[];
}
