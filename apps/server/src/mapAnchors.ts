/**
 * Anchor-point resolution for route-map annotations. Lap boundaries, segment
 * efforts, and photos arrive with distances or raw lat/lng, while the map app
 * renders by index into the (downsampled) latlng stream — Strava's
 * `start_index`/`end_index` fields refer to the full-resolution stream, so
 * they cannot be used against a `resolution=medium` response. These helpers
 * map both anchor kinds onto stream indices server-side, keeping the app's
 * bundle lean. Pure math, unit-tested next to `polyline.ts`.
 */

const DEG_TO_RAD = Math.PI / 180;

/**
 * Index of the coordinate nearest to (lat, lng). Equirectangular comparison
 * with cos-scaled longitude — accurate at single-activity scale, and
 * monotonic, which is all a nearest-point search needs. Returns -1 for an
 * empty track.
 */
export function nearestCoordIndex(
  coordinates: Array<[number, number]>,
  lat: number,
  lng: number,
): number {
  const lngScale = Math.cos(lat * DEG_TO_RAD);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < coordinates.length; i++) {
    const dLat = coordinates[i]![0] - lat;
    const dLng = (coordinates[i]![1] - lng) * lngScale;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * First index whose cumulative distance reaches `target` metres. The distance
 * stream is non-decreasing, so binary search. Clamps to the last index when
 * the target exceeds the stream (e.g. lap distances summing past the recorded
 * total). Returns -1 for an empty stream.
 */
export function indexAtDistance(
  distanceStream: number[],
  target: number,
): number {
  if (distanceStream.length === 0) return -1;
  let lo = 0;
  let hi = distanceStream.length - 1;
  if (distanceStream[hi]! < target) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distanceStream[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const EARTH_RADIUS_M = 6371000;

/**
 * Cumulative haversine distance (metres) along a `[lat, lng]` track, aligned
 * index-for-index with the coordinates. The distance-anchor fallback when no
 * recorded distance stream exists: saved routes and polyline-only activities
 * arrive as bare geometry, so anchors like waypoints need a synthetic
 * cumulative stream to resolve against.
 */
export function cumulativeDistances(
  coordinates: Array<[number, number]>,
): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < coordinates.length; i++) {
    if (i > 0) {
      const [lat1, lng1] = coordinates[i - 1]!;
      const [lat2, lng2] = coordinates[i]!;
      const dLat = (lat2 - lat1) * DEG_TO_RAD;
      const dLng = (lng2 - lng1) * DEG_TO_RAD;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * DEG_TO_RAD) *
          Math.cos(lat2 * DEG_TO_RAD) *
          Math.sin(dLng / 2) ** 2;
      total += 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }
    out.push(total);
  }
  return out;
}

/** Marker styles a waypoint can request; `custom` is the schema default. */
export type WaypointKind = "fuel" | "climb" | "water" | "custom";

/** A distance-anchored waypoint as supplied on the tool input. */
export interface WaypointInput {
  km: number;
  label: string;
  kind: WaypointKind;
}

/** A waypoint resolved onto the coordinate stream. */
export interface ResolvedWaypoint extends WaypointInput {
  /** Index into the (downsampled) coordinates. */
  index: number;
}

/**
 * Waypoints may overshoot the declared total by this fraction before being
 * dropped: a race plan says "gel at 42.2" while the recorded track measures
 * 42.16, and clamping such near-misses to the finish beats losing them.
 */
export const WAYPOINT_OVERSHOOT_FRACTION = 0.01;

/**
 * Anchor tool-input waypoints onto the coordinate stream by cumulative
 * distance. `distanceStream` is the recorded distance stream when the
 * activity has one, else `cumulativeDistances` of the geometry. Waypoints
 * past the track length (beyond the overshoot tolerance against
 * `declaredTotalMeters`, falling back to the stream's total) are returned in
 * `dropped` for the caller to warn about rather than erroring or rendering
 * off-track markers. Resolved waypoints come back sorted by distance.
 */
export function resolveWaypoints(
  waypoints: WaypointInput[],
  distanceStream: number[],
  declaredTotalMeters: number,
): { resolved: ResolvedWaypoint[]; dropped: WaypointInput[] } {
  const streamTotal = distanceStream[distanceStream.length - 1] ?? 0;
  const total = declaredTotalMeters > 0 ? declaredTotalMeters : streamTotal;
  const maxMeters = total * (1 + WAYPOINT_OVERSHOOT_FRACTION);

  const resolved: ResolvedWaypoint[] = [];
  const dropped: WaypointInput[] = [];
  for (const waypoint of waypoints) {
    const targetMeters = waypoint.km * 1000;
    if (targetMeters > maxMeters) {
      dropped.push(waypoint);
      continue;
    }
    const index = indexAtDistance(distanceStream, targetMeters);
    if (index < 0) {
      dropped.push(waypoint);
      continue;
    }
    resolved.push({ ...waypoint, index });
  }
  resolved.sort((a, b) => a.km - b.km);
  return { resolved, dropped };
}
