/**
 * Segment recon over a course, for `find-segments-on-route` (#268). Pure
 * geometry, unit-tested next to `mapAnchors.ts`.
 *
 * `explore-segments` answers "what is inside this rectangle", which for a 20 km
 * route means a box full of segments nowhere near the course. The answer people
 * actually want — "what will I hit, in order" — is composed here: tile the
 * course into small boxes so each explore call is asked about a stretch of the
 * route rather than its bounding rectangle, then keep only the candidates whose
 * start *and* end snap onto the track in forward order.
 */

import { haversineMeters, nearestCoordIndex } from "./mapAnchors";

/** A bounding box in the order Strava's explore endpoint wants it. */
export interface TileBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/** One explore call's worth of course: a box plus the stretch it covers. */
export interface CourseTile {
  bounds: TileBounds;
  /** Metres from the start of the course. */
  startM: number;
  endM: number;
}

/**
 * Default along-course length of one tile. Small enough that explore's 10-result
 * cap is spent on segments near this stretch rather than on the whole route's
 * rectangle, large enough not to need a call every few hundred metres.
 */
export const TILE_DISTANCE_M = 2000;
/**
 * Tiles overlap by this much so a segment straddling a tile boundary is still
 * fully inside one box.
 */
export const TILE_OVERLAP_M = 400;
/**
 * Explore calls one invocation will make. The cap does not truncate coverage:
 * `buildTiles` widens each tile until the whole course fits in this many, so a
 * long route is covered coarsely rather than partially.
 */
export const MAX_TILES = 12;
/** Boxes are padded by this much so a segment endpoint just off the line is in. */
export const TILE_PADDING_M = 150;

const METRES_PER_DEG_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

/** Longitude degrees for `metres` at this latitude. */
function lngDegrees(metres: number, lat: number): number {
  const scale = Math.max(0.05, Math.cos(lat * DEG_TO_RAD));
  return metres / (METRES_PER_DEG_LAT * scale);
}

/**
 * Split the course into overlapping boxes, one per `tileDistanceM` of progress.
 * The tile length grows when the course would otherwise need more than
 * `maxTiles`, so coverage is always complete — a partially-explored route
 * silently reporting "3 segments" would be worse than a coarse one.
 */
export function buildTiles(
  coordinates: Array<[number, number]>,
  distances: number[],
  options: {
    tileDistanceM?: number;
    overlapM?: number;
    maxTiles?: number;
    paddingM?: number;
  } = {},
): CourseTile[] {
  if (coordinates.length === 0 || distances.length !== coordinates.length) {
    return [];
  }
  const totalM = distances[distances.length - 1]!;
  if (totalM <= 0) {
    return [tileFor(coordinates, 0, coordinates.length - 1, 0, 0, options)];
  }

  const maxTiles = Math.max(1, options.maxTiles ?? MAX_TILES);
  const requested = options.tileDistanceM ?? TILE_DISTANCE_M;
  const step = Math.max(requested, Math.ceil(totalM / maxTiles));
  const overlapM = Math.min(options.overlapM ?? TILE_OVERLAP_M, step / 2);

  const tiles: CourseTile[] = [];
  let index = 0;
  for (let start = 0; start < totalM; start += step) {
    const end = Math.min(start + step + overlapM, totalM);
    // Walk forward to the tile's first index, then to its last.
    while (index < distances.length - 1 && distances[index]! < start) index++;
    const startIndex = index;
    let endIndex = startIndex;
    while (endIndex < distances.length - 1 && distances[endIndex]! < end) {
      endIndex++;
    }
    if (endIndex <= startIndex && startIndex >= distances.length - 1) break;
    tiles.push(tileFor(coordinates, startIndex, endIndex, start, end, options));
  }
  return tiles;
}

function tileFor(
  coordinates: Array<[number, number]>,
  startIndex: number,
  endIndex: number,
  startM: number,
  endM: number,
  options: { paddingM?: number },
): CourseTile {
  let swLat = Number.POSITIVE_INFINITY;
  let swLng = Number.POSITIVE_INFINITY;
  let neLat = Number.NEGATIVE_INFINITY;
  let neLng = Number.NEGATIVE_INFINITY;
  for (let i = startIndex; i <= endIndex; i++) {
    const [lat, lng] = coordinates[i]!;
    if (lat < swLat) swLat = lat;
    if (lat > neLat) neLat = lat;
    if (lng < swLng) swLng = lng;
    if (lng > neLng) neLng = lng;
  }
  const paddingM = options.paddingM ?? TILE_PADDING_M;
  const padLat = paddingM / METRES_PER_DEG_LAT;
  const padLng = lngDegrees(paddingM, (swLat + neLat) / 2);
  return {
    bounds: {
      swLat: round6(swLat - padLat),
      swLng: round6(swLng - padLng),
      neLat: round6(neLat + padLat),
      neLng: round6(neLng + padLng),
    },
    startM: Math.round(startM),
    endM: Math.round(endM),
  };
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Explore's `bounds` parameter: `swLat,swLng,neLat,neLng`. */
export function boundsString(bounds: TileBounds): string {
  return `${bounds.swLat},${bounds.swLng},${bounds.neLat},${bounds.neLng}`;
}

/** Where a candidate segment sits on the course. */
export interface TrackPlacement {
  startIndex: number;
  endIndex: number;
  /** Metres from the course start. */
  startM: number;
  endM: number;
  /** How far the segment's own endpoints sit from the course, in metres. */
  offCourseM: number;
}

/**
 * Default distance a segment endpoint may sit from the course and still count
 * as on it. Generous on purpose: a saved route reaches us as a downsampled
 * polyline, so its vertices can be tens of metres from the real line, and a
 * false negative here reads as "this segment isn't on your route" — a wrong
 * answer, where a false positive is merely a segment to skim past.
 */
export const ON_COURSE_TOLERANCE_M = 100;

/**
 * Snap a candidate segment onto the course, or reject it.
 *
 * Both endpoints must land within `toleranceM` of the track, and the end must
 * come after the start — the forward-order rule the map's segment annotations
 * already use, which is what rejects a segment that merely happens to run
 * alongside the course in the opposite direction.
 */
export function placeOnTrack(
  coordinates: Array<[number, number]>,
  distances: number[],
  startLatLng: readonly number[] | undefined,
  endLatLng: readonly number[] | undefined,
  toleranceM: number = ON_COURSE_TOLERANCE_M,
): TrackPlacement | null {
  if (
    !startLatLng ||
    startLatLng.length < 2 ||
    !endLatLng ||
    endLatLng.length < 2 ||
    coordinates.length === 0
  ) {
    return null;
  }
  const start: [number, number] = [startLatLng[0]!, startLatLng[1]!];
  const end: [number, number] = [endLatLng[0]!, endLatLng[1]!];

  const startIndex = nearestCoordIndex(coordinates, start[0], start[1]);
  const endIndex = nearestCoordIndex(coordinates, end[0], end[1]);
  if (startIndex < 0 || endIndex <= startIndex) return null;

  const startOff = haversineMeters(coordinates[startIndex]!, start);
  const endOff = haversineMeters(coordinates[endIndex]!, end);
  if (startOff > toleranceM || endOff > toleranceM) return null;

  return {
    startIndex,
    endIndex,
    startM: Math.round(distances[startIndex] ?? 0),
    endM: Math.round(distances[endIndex] ?? 0),
    offCourseM: Math.round(Math.max(startOff, endOff)),
  };
}

/** A candidate keyed by segment id, so tile overlap cannot duplicate it. */
export interface PlacedSegment {
  id: string;
  placement: TrackPlacement;
}

/**
 * One entry per segment, in course order. Overlapping tiles return the same
 * segment more than once; the closest placement wins, then the earliest.
 */
export function dedupeInCourseOrder<T extends PlacedSegment>(
  candidates: T[],
): T[] {
  const best = new Map<string, T>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.id);
    if (
      !existing ||
      candidate.placement.offCourseM < existing.placement.offCourseM ||
      (candidate.placement.offCourseM === existing.placement.offCourseM &&
        candidate.placement.startM < existing.placement.startM)
    ) {
      best.set(candidate.id, candidate);
    }
  }
  return [...best.values()].sort(
    (a, b) => a.placement.startM - b.placement.startM,
  );
}
