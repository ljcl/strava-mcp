/**
 * Annotation-layer preparation: turns the server's annotation anchors (plus
 * the distance stream) into renderable marker lists. The server resolves lap
 * boundaries, segment-effort spans, and photo locations into coordinate
 * indices; this module picks the split source (laps when the activity has
 * them, kilometre marks otherwise), thins dense km marks, and groups photos
 * sharing a track point. Pure data, unit-tested.
 */

import { type RouteMapData } from "./types";

export interface SplitMarker {
  /** Index into the track coordinates. */
  index: number;
  /** Marker title, e.g. "Lap 2" or "5 km". */
  label: string;
}

export interface PhotoMarker {
  index: number;
  /** Photos taken at this track point. */
  count: number;
  /** Joined captions for the marker title, or null when none have one. */
  caption: string | null;
}

/** Keep split dots readable: thin km marks beyond this count. */
const MAX_SPLIT_MARKERS = 24;

/** Candidate km steps, coarsest last. */
const KM_STEPS = [1, 2, 5, 10, 20, 50];

/**
 * Kilometre markers from the cumulative distance stream, thinned to a 1/2/5…
 * km step so long rides don't drown the track in dots. The final mark is
 * dropped when it would sit on the finish marker.
 */
export function buildKmSplits(distanceStream: number[]): SplitMarker[] {
  const n = distanceStream.length;
  if (n < 2) return [];
  const start = distanceStream[0]!;
  const total = distanceStream[n - 1]! - start;
  const kmTotal = Math.floor(total / 1000);
  if (kmTotal < 1) return [];

  const step =
    KM_STEPS.find((s) => kmTotal / s <= MAX_SPLIT_MARKERS) ??
    KM_STEPS[KM_STEPS.length - 1]!;

  const markers: SplitMarker[] = [];
  let searchFrom = 0;
  for (let km = step; km <= kmTotal; km += step) {
    const target = start + km * 1000;
    // The stream is non-decreasing, so resume scanning where the last
    // marker landed.
    while (searchFrom < n - 1 && distanceStream[searchFrom]! < target) {
      searchFrom++;
    }
    // Skip a mark that collapses onto the finish.
    if (searchFrom >= n - 1) break;
    markers.push({ index: searchFrom, label: `${km} km` });
  }
  return markers;
}

/**
 * The split markers to render: lap boundaries when the server resolved any
 * (multi-lap activities), kilometre marks otherwise.
 */
export function buildSplitMarkers(data: RouteMapData): SplitMarker[] {
  const laps = data.annotations?.laps;
  if (laps && laps.length > 0) {
    return laps.map((lap) => ({ index: lap.endIndex, label: lap.name }));
  }
  const distance = data.streams?.distance;
  if (distance && distance.length === data.coordinates.length) {
    return buildKmSplits(distance);
  }
  return [];
}

/** Group photos sharing a track point into one marker with a count. */
export function buildPhotoMarkers(data: RouteMapData): PhotoMarker[] {
  const photos = data.annotations?.photos;
  if (!photos || photos.length === 0) return [];
  const byIndex = new Map<number, { count: number; captions: string[] }>();
  for (const photo of photos) {
    const entry = byIndex.get(photo.index) ?? { count: 0, captions: [] };
    entry.count += 1;
    if (photo.caption) entry.captions.push(photo.caption);
    byIndex.set(photo.index, entry);
  }
  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, { count, captions }]) => ({
      index,
      count,
      caption: captions.length > 0 ? captions.join(" · ") : null,
    }));
}
