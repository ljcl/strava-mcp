/**
 * Geometry for the elevation strip beneath the map: pure math from the
 * altitude/distance streams into SVG paths plus per-sample x positions so the
 * scrub marker can sync with the track. No React, unit-tested alongside
 * `normalize.ts`.
 */

export interface ElevationProfileOptions {
  /** Strip viewBox width (matches the map's, so x positions line up). */
  width: number;
  /** Strip viewBox height. */
  height: number;
  /** Headroom above the highest point. */
  padTop: number;
}

export interface ElevationProfile {
  /** Open polyline along the elevation samples. */
  linePath: string;
  /** Same polyline closed down to the strip floor, for the area fill. */
  areaPath: string;
  /** X position per sample index (scrub sync with the track). */
  xs: number[];
  /** Y position per sample index. */
  ys: number[];
  /** Altitude domain in metres. */
  min: number;
  max: number;
}

/** Trim coordinates to 2 dp so the generated path strings stay compact. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build the strip geometry. X spacing follows the cumulative distance stream
 * when one aligns with the altitude samples (so flat-speed sections don't
 * stretch), falling back to even index spacing. Returns null when there are
 * too few samples to draw a line.
 */
export function buildElevationProfile(
  altitude: number[],
  distance: number[] | undefined,
  opts: ElevationProfileOptions,
): ElevationProfile | null {
  const n = altitude.length;
  if (n < 2) return null;

  const { width, height, padTop } = opts;

  let xs: number[];
  const d0 = distance?.[0] ?? 0;
  const dSpan = (distance?.[n - 1] ?? 0) - d0;
  if (distance && distance.length === n && dSpan > 0) {
    xs = distance.map((d) => ((d - d0) / dSpan) * width);
  } else {
    xs = altitude.map((_, i) => (i / (n - 1)) * width);
  }

  let min = Infinity;
  let max = -Infinity;
  for (const a of altitude) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  const span = max - min;
  const drawable = height - padTop;
  const ys = altitude.map((a) =>
    // A flat profile sits on a midline rather than collapsing to the floor.
    span > 1e-9 ? padTop + ((max - a) / span) * drawable : height / 2,
  );

  const linePath = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(ys[i]!)}`)
    .join(" ");
  const areaPath = `${linePath} L${round(xs[n - 1]!)} ${height} L${round(
    xs[0]!,
  )} ${height} Z`;

  return { linePath, areaPath, xs, ys, min, max };
}

/** Index of the sample whose x position is closest to `x`. -1 when empty. */
export function nearestXIndex(xs: number[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dist = Math.abs(xs[i]! - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
