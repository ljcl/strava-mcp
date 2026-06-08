/** Whether the rendered path came from an activity or a saved route. */
export type RouteMapSource = "activity" | "route";

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
}

/** Tool input for `view-route-map`: exactly one of these is provided. */
export interface ToolArgs {
  activity_id?: string;
  route_id?: string;
}
