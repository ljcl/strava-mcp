/**
 * Metric coloring for the route track. Pure data + color math, kept free of
 * React so it can be unit-tested next to `normalize.ts`. A metric series wraps
 * one stream (aligned with the track coordinates) with a clamped color domain
 * and a tooltip formatter; `buildTrackSegments` turns the projected points
 * plus a series into binned, same-color SVG path runs so the DOM stays at a
 * handful of `<path>` elements instead of one per GPS sample.
 */

import { formatPace, isRunning } from "@strava-mcp/data";
import { type Point } from "./normalize";
import { type RouteMapData } from "./types";

export type MetricKey =
  | "pace"
  | "heartrate"
  | "power"
  | "altitude"
  | "gradient";

export interface MetricSeries {
  key: MetricKey;
  /** Pill / tooltip label ("Pace" or "Speed" for the pace key). */
  label: string;
  /** Compact pill label for mobile, where five pills must share a card row. */
  shortLabel: string;
  /** Raw per-point values used for coloring, aligned with coordinates. */
  values: number[];
  /** Color domain (percentile-clamped so outliers don't flatten the ramp). */
  min: number;
  max: number;
  /** Format a raw value for the scrub tooltip, unit included. */
  format: (value: number) => string;
}

/**
 * Cold-to-hot ramp. Fixed hex stops rather than theme vars: interpolation
 * needs concrete colors, and these read on both light and dark backgrounds.
 */
const RAMP: Array<[number, number, number]> = [
  [37, 99, 235], // blue
  [22, 163, 74], // green
  [234, 179, 8], // yellow
  [220, 38, 38], // red
];

/** CSS gradient matching the ramp, for the scale legend bar. */
export const RAMP_GRADIENT_CSS = `linear-gradient(90deg, ${RAMP.map(
  ([r, g, b]) => `rgb(${r}, ${g}, ${b})`,
).join(", ")})`;

/** Map a normalized position 0..1 onto the ramp. Clamps out-of-range input. */
export function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (RAMP.length - 1);
  const lo = Math.min(RAMP.length - 2, Math.floor(scaled));
  const frac = scaled - lo;
  const [r1, g1, b1] = RAMP[lo]!;
  const [r2, g2, b2] = RAMP[lo + 1]!;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * frac);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

/**
 * Color domain from the 5th..95th percentiles, so a brief GPS glitch or a
 * single sprint doesn't compress the rest of the track into one hue.
 */
export function percentileDomain(values: number[]): {
  min: number;
  max: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { min: at(0.05), max: at(0.95) };
}

function normalizeValue(value: number, min: number, max: number): number {
  if (max - min < 1e-9) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Ramp color for one raw value within a series' domain (tooltip swatch). */
export function colorForValue(
  series: Pick<MetricSeries, "min" | "max">,
  value: number,
): string {
  return rampColor(normalizeValue(value, series.min, series.max));
}

/** Slower than a walk: treat as paused rather than formatting a huge pace. */
const MIN_PACE_SPEED = 0.3;

function formatSpeedAsPace(metresPerSecond: number): string {
  if (metresPerSecond < MIN_PACE_SPEED) return "—";
  return `${formatPace(1000 / metresPerSecond / 60)} /km`;
}

function formatSpeedAsKmh(metresPerSecond: number): string {
  return `${(metresPerSecond * 3.6).toFixed(1)} km/h`;
}

/**
 * Build the selectable metric series for an activity, in pill display order.
 * Only streams that are present and aligned with the coordinates qualify, so
 * saved routes and stream-less activities yield an empty list (plain track).
 */
export function buildMetricSeries(data: RouteMapData): MetricSeries[] {
  const streams = data.streams;
  const pointCount = data.coordinates.length;
  if (!streams || pointCount === 0) return [];

  const aligned = (values: number[] | undefined): number[] | null =>
    values && values.length === pointCount ? values : null;

  const running = data.activityType ? isRunning(data.activityType) : false;
  const series: MetricSeries[] = [];

  const velocity = aligned(streams.velocity_smooth);
  if (velocity) {
    series.push({
      key: "pace",
      label: running ? "Pace" : "Speed",
      shortLabel: running ? "Pace" : "Speed",
      values: velocity,
      ...percentileDomain(velocity),
      format: running ? formatSpeedAsPace : formatSpeedAsKmh,
    });
  }

  const heartrate = aligned(streams.heartrate);
  if (heartrate) {
    series.push({
      key: "heartrate",
      label: "Heart rate",
      shortLabel: "HR",
      values: heartrate,
      ...percentileDomain(heartrate),
      format: (v) => `${Math.round(v)} bpm`,
    });
  }

  const watts = aligned(streams.watts);
  if (watts) {
    series.push({
      key: "power",
      label: "Power",
      shortLabel: "Power",
      values: watts,
      ...percentileDomain(watts),
      format: (v) => `${Math.round(v)} W`,
    });
  }

  const altitude = aligned(streams.altitude);
  if (altitude) {
    series.push({
      key: "altitude",
      label: "Elevation",
      shortLabel: "Elev",
      values: altitude,
      ...percentileDomain(altitude),
      format: (v) => `${Math.round(v)} m`,
    });
  }

  const grade = aligned(streams.grade_smooth);
  if (grade) {
    series.push({
      key: "gradient",
      label: "Gradient",
      shortLabel: "Grade",
      values: grade,
      ...percentileDomain(grade),
      format: (v) => `${v.toFixed(1)} %`,
    });
  }

  return series;
}

export interface TrackSegment {
  /** SVG path `d` string for one same-color run of the track. */
  path: string;
  color: string;
}

/** Distinct hues along the track; more bins means more paths in the DOM. */
const COLOR_BINS = 12;

/** Trim coordinates to 2 dp so the generated path strings stay compact. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Split the projected track into runs of consecutive segments that fall into
 * the same color bin, each run emitted as a single path. Adjacent runs share
 * their boundary point, so there are no gaps between strokes.
 */
export function buildTrackSegments(
  points: Point[],
  series: Pick<MetricSeries, "values" | "min" | "max">,
): TrackSegment[] {
  const { values, min, max } = series;
  if (points.length < 2 || values.length !== points.length) return [];

  const binOf = (i: number) => {
    // Color each leg by the midpoint of its endpoint values.
    const t = normalizeValue((values[i]! + values[i + 1]!) / 2, min, max);
    return Math.min(COLOR_BINS - 1, Math.floor(t * COLOR_BINS));
  };

  const segments: TrackSegment[] = [];
  let runStart = 0;
  let runBin = binOf(0);
  for (let i = 1; i <= points.length - 1; i++) {
    const isLast = i === points.length - 1;
    const bin = isLast ? -1 : binOf(i);
    if (bin === runBin && !isLast) continue;

    const runPoints = points.slice(runStart, i + 1);
    const path = runPoints
      .map((p, j) => `${j === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
      .join(" ");
    segments.push({
      path,
      color: rampColor((runBin + 0.5) / COLOR_BINS),
    });
    runStart = i;
    runBin = bin;
  }
  return segments;
}
