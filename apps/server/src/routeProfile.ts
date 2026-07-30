/**
 * Elevation resolution for saved routes (#264).
 *
 * A route used to reach the map as an encoded polyline and nothing else, so
 * route-map's elevation strip, metric colouring, and scrub readouts were dead
 * code for every `route_id` — and route recon ("where are the climbs, how bad
 * is the one at 14 km?") meant leaving for the Strava web app. Routes do carry
 * a stored profile; it just lives behind `/routes/{id}/streams`.
 *
 * One loader serves both `get-route-map-data` and `get-route-preview` so the
 * chart and the prose cannot disagree about a route's elevation, and so the
 * GPX fallback below is written once. Older routes have no stored streams (a
 * 404, i.e. `StreamsUnavailableError`) but their GPX export still carries
 * `<ele>` per track point, which is a better answer than none.
 */

import { HttpError } from "./fetchClient";
import { parseGpxTrackPoints } from "./gpxTrackPoints";
import { cumulativeDistances } from "./mapAnchors";
import {
  exportRouteGpx,
  getRouteStreams,
  StreamsUnavailableError,
} from "./stravaClient";

/** Where a route's elevation came from — reported so the caller can say. */
export type RouteProfileSource = "streams" | "gpx";

export interface RouteProfile {
  source: RouteProfileSource;
  /** `[lat, lng]` pairs, index-aligned with the arrays below. */
  coordinates: Array<[number, number]>;
  /** Cumulative metres. Recorded on the stream path, haversine on the GPX one. */
  distance: number[];
  /** Metres. */
  altitude: number[];
}

/** Coordinate pairs as Strava's latlng stream delivers them. */
function toCoordinates(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  const out: Array<[number, number]> = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const lat = Number(entry[0]);
    const lng = Number(entry[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
  }
  return out;
}

function numbers(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const out: number[] = [];
  for (const entry of value) {
    const n = Number(entry);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

/**
 * A route's coordinates plus its aligned distance and altitude arrays, or null
 * when neither the stream nor the GPX export carries elevation.
 *
 * Only a genuinely profile-less route falls through to the GPX path and only a
 * genuinely elevation-less GPX yields null — an expired token or an exhausted
 * rate limit propagates, per #237's rule that "no data" must not be the answer
 * to every failure.
 */
export async function loadRouteProfile(
  token: string,
  routeId: string,
): Promise<RouteProfile | null> {
  try {
    const streams = await getRouteStreams(token, routeId);
    const altitudeRaw = streams.get("altitude");
    if (Array.isArray(altitudeRaw) && altitudeRaw.length >= 2) {
      const length = altitudeRaw.length;
      const altitude = numbers(altitudeRaw, length);
      if (altitude) {
        const coordinates = toCoordinates(streams.get("latlng"));
        // Prefer the recorded distance stream; synthesise it from the geometry
        // when the route stored altitude without it.
        const recorded = numbers(streams.get("distance"), length);
        const distance =
          recorded ??
          (coordinates.length === length
            ? cumulativeDistances(coordinates)
            : null);
        if (distance) {
          return {
            source: "streams",
            coordinates: coordinates.length === length ? coordinates : [],
            distance,
            altitude,
          };
        }
      }
    }
  } catch (error) {
    if (!(error instanceof StreamsUnavailableError)) throw error;
  }

  // Fallback: the GPX export of a pre-profile route still has <ele> per point.
  let gpx: string;
  try {
    gpx = await exportRouteGpx(token, routeId);
  } catch (error) {
    // A route with no downloadable GPX either has no profile to recover or does
    // not exist; both are "no elevation". Anything else — an expired token, an
    // exhausted quota — is a real failure and must not read as a flat route.
    if (error instanceof HttpError && error.response.status === 404)
      return null;
    throw error;
  }
  const points = parseGpxTrackPoints(gpx);
  const withElevation = points.filter((p) => p.ele != null);
  if (withElevation.length < 2) return null;

  const coordinates = withElevation.map(
    (p) => [p.lat, p.lng] as [number, number],
  );
  return {
    source: "gpx",
    coordinates,
    distance: cumulativeDistances(coordinates),
    altitude: withElevation.map((p) => p.ele as number),
  };
}
