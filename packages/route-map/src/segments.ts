/**
 * Segment-effort selection and lookup, kept pure so it unit-tests without a
 * map. Two concerns: which segments earn a drawn outline (kept lean so a
 * segment-dense activity does not bury the track), and which segments cover a
 * given track index (for the scrub tooltip, which lists them all regardless of
 * the outline toggle).
 */

import { type RouteAnnotations } from "./types";

export type RouteSegment = NonNullable<RouteAnnotations["segments"]>[number];

/** Extra non-notable segments to outline, longest-first, beyond the PRs. */
export const OUTLINE_EXTRA_LONGEST = 4;

/** PR/Top-10 sort weight; PRs rank above top-10s above plain efforts. */
function tierRank(segment: RouteSegment): number {
  return (segment.isPr ? 2 : 0) + (segment.isTop10 ? 1 : 0);
}

/**
 * Segments that earn a drawn outline: every notable (PR / top-10) effort plus
 * the `extraLongest` longest remaining efforts by distance. Returned in the
 * input's order (by start index) so render/z-order stays stable; the tooltip
 * still surfaces the segments this drops.
 */
export function selectOutlineSegments(
  segments: RouteSegment[],
  extraLongest: number = OUTLINE_EXTRA_LONGEST,
): RouteSegment[] {
  const longestRest = segments
    .filter((s) => !s.isPr && !s.isTop10)
    .sort((a, b) => b.distanceMeters - a.distanceMeters)
    .slice(0, Math.max(0, extraLongest));
  const chosen = new Set<RouteSegment>([
    ...segments.filter((s) => s.isPr || s.isTop10),
    ...longestRest,
  ]);
  return segments.filter((s) => chosen.has(s));
}

/**
 * Segments whose span covers `index`, most relevant first: notable efforts
 * lead, then the shortest span (the most specific "mini" segment you are on).
 * Empty when `index` is null or no segment covers it.
 */
export function segmentsAtIndex(
  segments: RouteSegment[],
  index: number | null,
): RouteSegment[] {
  if (index == null) return [];
  return segments
    .filter((s) => index >= s.startIndex && index <= s.endIndex)
    .sort(
      (a, b) =>
        tierRank(b) - tierRank(a) ||
        a.endIndex - a.startIndex - (b.endIndex - b.startIndex),
    );
}

/** Compact distance label for a tooltip row ("80 m" / "1.2 km"). */
export function formatSegmentDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}
