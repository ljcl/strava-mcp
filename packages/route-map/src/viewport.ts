/**
 * Resolving a distance range on the course to a map viewBox.
 *
 * The `set-viewport` view tool lets the model answer "show me the climb at
 * 14 km" by moving the map itself. Turning a kilometre range into a viewBox
 * is two steps, both pure and both kept here rather than inside the component:
 * find the index range the distances cover, then frame the projected points
 * across it.
 */

import { clampView, type ViewBox } from "./panZoom";

export interface IndexRange {
  from: number;
  to: number;
}

/**
 * The index range covering `[fromM, toM]` in a cumulative distance stream
 * (metres, non-decreasing, index-aligned with the coordinates).
 *
 * Returns null when the requested window lies entirely off the course — the
 * caller says "this route is only 12.4 km" rather than silently framing the
 * finish. A window that merely overhangs one end is clamped, since "the last
 * 5 km of a 3 km route" is a reasonable thing to ask for loosely.
 */
export function indexRangeForDistance(
  distance: readonly number[],
  fromM: number,
  toM: number,
): IndexRange | null {
  if (distance.length === 0) return null;
  const first = distance[0]!;
  const last = distance[distance.length - 1]!;
  const lo = Math.min(fromM, toM);
  const hi = Math.max(fromM, toM);
  if (hi < first || lo > last) return null;

  let from = distance.findIndex((d) => d >= lo);
  if (from === -1) from = distance.length - 1;
  let to = from;
  while (to + 1 < distance.length && distance[to + 1]! <= hi) to += 1;
  // A window narrower than the sample spacing collapses to one point, which
  // has no extent to frame; widen it by a sample so there is a line to see.
  if (to === from) to = Math.min(distance.length - 1, from + 1);
  if (to === from && from > 0) from -= 1;
  return { from, to };
}

export interface FramePoint {
  x: number;
  y: number;
}

/**
 * A viewBox framing `points[from..to]`, padded by `padFraction` of the
 * framed extent and clamped to the base frame.
 *
 * The aspect ratio of `base` is preserved: the SVG viewport is a fixed shape,
 * so a viewBox of a different ratio would letterbox the track rather than fill
 * the frame. The wider of the two axes wins and the other is grown to match.
 */
export function frameForIndexRange(
  points: readonly FramePoint[],
  { from, to }: IndexRange,
  base: ViewBox,
  padFraction = 0.15,
): ViewBox | null {
  const slice = points.slice(from, to + 1);
  if (slice.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of slice) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const padded = 1 + padFraction * 2;
  const wantW = (maxX - minX) * padded;
  const wantH = (maxY - minY) * padded;

  // Match the base aspect so the framed stretch fills the viewport instead of
  // being letterboxed into it.
  const aspect = base.w / base.h;
  let w = Math.max(wantW, wantH * aspect);
  let h = w / aspect;
  // A stretch of course that is a single point in projection (a lap on the
  // spot) still needs a frame with area; fall back to the deepest zoom.
  if (!(w > 0) || !(h > 0)) {
    w = base.w / 8;
    h = base.h / 8;
  }

  return clampView({ x: cx - w / 2, y: cy - h / 2, w, h }, base);
}
