/**
 * Decoder for Google "encoded polyline" strings.
 *
 * Strava only ever returns activity and route geometry as these encoded
 * strings — never as raw coordinate arrays. Activities expose
 * `map.summary_polyline` (and `map.polyline` on the detailed resource); saved
 * routes expose `map.summary_polyline`. There is no decoder elsewhere in the
 * codebase, so the `get-route-map-data` tool decodes here, server-side, where
 * it sits next to the zod schemas and stays unit-testable.
 *
 * This is the standard Google polyline algorithm at the default precision of
 * 1e5 (5 decimal places, ~1 m resolution):
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(
  encoded: string,
  precision = 5,
): Array<[number, number]> {
  if (!encoded) return [];

  const factor = 10 ** precision;
  const coordinates: Array<[number, number]> = [];
  const len = encoded.length;
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    // Each coordinate is two varint-encoded, zig-zag signed deltas (lat, lng)
    // applied to a running total. `byte - 63` undoes the +63 ASCII offset;
    // the high bit (0x20) flags that more 5-bit chunks follow.
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}
