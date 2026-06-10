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
