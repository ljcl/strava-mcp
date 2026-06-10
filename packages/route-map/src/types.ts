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
  /** Annotation anchors resolved server-side; absent without stream data. */
  annotations?: RouteAnnotations;
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
    isPr: boolean;
    isTop10: boolean;
  }>;
  /** Geotagged photos snapped to the nearest track point. */
  photos?: Array<{ index: number; caption: string | null }>;
}

/** Tool input for `view-route-map`: exactly one of these is provided. */
export interface ToolArgs {
  activity_id?: string;
  route_id?: string;
}
