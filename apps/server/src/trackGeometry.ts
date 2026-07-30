/**
 * Resolve an `activity_id` or `route_id` into a course: coordinates plus a
 * cumulative distance array aligned with them (#268).
 *
 * Deliberately separate from `server.ts`'s `loadRouteMapGeometry`, which
 * answers a different question — it fetches the whole metric stream set at
 * `resolution=medium` and resolves lap/segment/photo anchors for the map app.
 * `find-segments-on-route` needs geometry and along-course distance and nothing
 * else, and asking for the map payload would spend extra Strava calls per
 * invocation. Both sit on the same shared primitives (`decodePolyline`,
 * `cumulativeDistances`, `loadRouteProfile`, `getActivityStreams`), so the
 * geometry they derive agrees.
 */

import { cumulativeDistances } from "./mapAnchors";
import { decodePolyline } from "./polyline";
import { loadRouteProfile } from "./routeProfile";
import {
  getActivityById,
  getActivityStreams,
  getRouteById,
  type StravaDetailedActivity,
  StreamsUnavailableError,
} from "./stravaClient";

/** One segment effort already recorded on the course, when it is an activity. */
export interface TrackEffort {
  segmentId: string;
  name: string;
  elapsedTime: number;
  prRank: number | null;
  komRank: number | null;
}

export interface TrackGeometry {
  source: "activity" | "route";
  id: string;
  name: string;
  /** "Run", "Ride", … for an activity; the route's discipline for a route. */
  activityType: string | null;
  /** Strava's declared total distance in metres. */
  declaredDistanceM: number;
  coordinates: Array<[number, number]>;
  /** Cumulative metres, index-aligned with `coordinates`. */
  distances: number[];
  /** Whether `distances` is Strava's recorded stream or derived by haversine. */
  distanceSource: "stream" | "haversine";
  /** Efforts already on the activity; empty for a route. */
  efforts: TrackEffort[];
}

/** 1 = ride, 2 = run in Strava's route `type` enum. */
function routeTypeLabel(type: number): string {
  return type === 2 ? "Run" : "Ride";
}

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

function effortsOf(activity: StravaDetailedActivity): TrackEffort[] {
  return (activity.segment_efforts ?? []).map((effort) => ({
    segmentId: String(effort.segment?.id ?? ""),
    name: effort.name,
    elapsedTime: effort.elapsed_time,
    prRank: effort.pr_rank ?? null,
    komRank: effort.kom_rank ?? null,
  }));
}

/**
 * Load the course for either id. Throws when neither id is given, and when the
 * resolved geometry has too few points to place anything on.
 */
export async function loadTrackGeometry(
  token: string,
  ids: { activityId?: string; routeId?: string },
): Promise<TrackGeometry> {
  const geometry = ids.activityId
    ? await loadActivityTrack(token, ids.activityId)
    : ids.routeId
      ? await loadRouteTrack(token, ids.routeId)
      : null;
  if (!geometry) {
    throw new Error("Provide either activity_id or route_id.");
  }
  return geometry;
}

async function loadActivityTrack(
  token: string,
  activityId: string,
): Promise<TrackGeometry> {
  const activity = await getActivityById(token, activityId);

  let coordinates: Array<[number, number]> = [];
  let distances: number[] | null = null;
  try {
    const streams = await getActivityStreams(
      token,
      activityId,
      ["latlng", "distance"],
      { seriesType: "distance", resolution: "medium" },
    );
    coordinates = toCoordinates(streams.get("latlng"));
    const recorded = streams.get("distance");
    if (
      Array.isArray(recorded) &&
      recorded.length === coordinates.length &&
      recorded.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      distances = recorded as number[];
    }
  } catch (error) {
    // A manual entry has no streams but may still have a polyline; anything
    // else (auth, quota) is a real failure and must not read as a bare track.
    if (!(error instanceof StreamsUnavailableError)) throw error;
  }

  if (coordinates.length < 2) {
    coordinates = decodePolyline(
      activity.map?.polyline || activity.map?.summary_polyline || "",
    );
    distances = null;
  }

  return {
    source: "activity",
    id: String(activity.id),
    name: activity.name,
    activityType: activity.sport_type ?? activity.type ?? null,
    declaredDistanceM: activity.distance ?? 0,
    coordinates,
    distances: distances ?? cumulativeDistances(coordinates),
    distanceSource: distances ? "stream" : "haversine",
    efforts: effortsOf(activity),
  };
}

async function loadRouteTrack(
  token: string,
  routeId: string,
): Promise<TrackGeometry> {
  const [route, profile] = await Promise.all([
    getRouteById(token, routeId),
    loadRouteProfile(token, routeId),
  ]);

  // The profile's geometry is the full-resolution track when it exists; the
  // summary polyline is a coarser fallback.
  const fromProfile =
    profile && profile.coordinates.length >= 2 ? profile : null;
  const coordinates = fromProfile
    ? fromProfile.coordinates
    : decodePolyline(route.map?.polyline || route.map?.summary_polyline || "");
  const recorded =
    fromProfile && fromProfile.distance.length === coordinates.length
      ? fromProfile.distance
      : null;

  return {
    source: "route",
    id: String(route.id),
    name: route.name,
    activityType: routeTypeLabel(route.type),
    declaredDistanceM: route.distance,
    coordinates,
    distances: recorded ?? cumulativeDistances(coordinates),
    distanceSource: recorded ? "stream" : "haversine",
    efforts: [],
  };
}
