/**
 * Gradient-profile math for `get-segment-profile` (#266) and
 * `get-route-preview` (#264). Pure functions over a distance + altitude pair,
 * unit-tested next to `hillAnalysis.ts`.
 *
 * Both callers answer the same question — "an average grade of 4% hides the
 * difference between a steady ramp and a flat kilometre followed by a wall" —
 * and neither has a time stream: a segment's stored streams and a saved
 * route's are geometry and elevation only. That rules out `hillAnalysis.ts`'s
 * `computeHillAnalysis`, which is built on pace and heart rate, so this module
 * reuses its two time-free primitives (`computeGrades`, `detectSustained`) and
 * adds the presentation layer they need: fixed-length gradient bands, the
 * steepest sustained stretch and where it sits, and a shape verdict.
 */

import {
  computeGrades,
  detectSustained,
  type HillStreams,
} from "./hillAnalysis";

/** The two streams a profile needs. Index-aligned, distance non-decreasing. */
export interface ProfileStreams {
  /** Cumulative metres from the start. */
  distance: number[];
  /** Elevation in metres. */
  altitude: number[];
  /** Strava's smoothed grade, when the resource happens to record one. */
  grade_smooth?: number[];
}

/** Raised for inputs a profile cannot be built from; message is user-facing. */
export class GradientProfileError extends Error {}

/** One fixed-length slice of the course. */
export interface GradientBand {
  /** Metres from the start where the band opens. */
  startM: number;
  endM: number;
  lengthM: number;
  /** Mean grade across the band, in percent. */
  gradePct: number;
  elevationChangeM: number;
}

/** A contiguous stretch worth naming: a detected climb, or the crux. */
export interface SustainedStretch {
  startM: number;
  endM: number;
  lengthM: number;
  gradePct: number;
  elevationChangeM: number;
  /** Midpoint as a fraction (0–1) of total length — where to expect it. */
  positionFraction: number;
}

/**
 * How the climbing is distributed. `steady` and `rolling` are the two ways an
 * average grade lies: the first is honest about the whole course, the second
 * means the average is netting out real ups and downs.
 */
export type ProfileShape =
  | "flat"
  | "steady"
  | "front-loaded"
  | "back-loaded"
  | "rolling"
  | "descending";

export interface GradientProfile {
  lengthM: number;
  /** Sum of the bands' positive changes — band-smoothed, not sample noise. */
  elevationGainM: number;
  elevationLossM: number;
  netElevationChangeM: number;
  minAltitudeM: number;
  maxAltitudeM: number;
  /** Net grade start→end, the figure `get-segment` reports today. */
  avgGradePct: number;
  bandLengthM: number;
  bands: GradientBand[];
  /** Sustained climbs, via `hillAnalysis`'s dip-tolerant detector. */
  climbs: SustainedStretch[];
  /** Steepest sustained window — the crux. Null on a course with no relief. */
  steepest: SustainedStretch | null;
  shape: ProfileShape;
  warnings: string[];
}

/** Window the crux search slides; the shortest stretch worth calling steep. */
export const CRUX_WINDOW_M = 200;
/** Absolute grade (%) below which a course counts as having no relief. */
export const FLAT_GRADE_PCT = 1;
/** Elevation change (m) below which gain or loss is treated as noise. */
export const FLAT_ELEVATION_M = 5;
/**
 * Share of total gain that must land in one third of the course for it to read
 * as front- or back-loaded rather than steady.
 */
export const LOADED_GAIN_SHARE = 0.5;
/**
 * Descent-to-climb ratio above which a course is "rolling" — the average grade
 * is netting out real relief rather than describing a single slope.
 */
export const ROLLING_LOSS_RATIO = 0.5;

const round = (value: number, dp = 1) =>
  Math.round(value * 10 ** dp) / 10 ** dp;

/**
 * Band length that keeps the breakdown readable at any course length: 100 m
 * bands over a 20 km route would be 200 rows of text, and 500 m bands over a
 * 600 m segment would be one.
 */
export function chooseBandLength(totalM: number): number {
  if (totalM <= 3000) return 100;
  if (totalM <= 8000) return 250;
  if (totalM <= 20000) return 500;
  return 1000;
}

/** Fraction of a band length below which a trailing remnant is merged back. */
const MIN_TRAILING_BAND_FRACTION = 0.4;

/**
 * Split the course into `bandLengthM` slices and report each one's mean grade.
 * A short trailing remnant is merged into the band before it, so a 640 m
 * segment reads as six bands and not five plus a 40 m sliver whose grade is
 * dominated by two samples.
 */
export function buildGradientBands(
  distance: number[],
  altitude: number[],
  bandLengthM: number,
): GradientBand[] {
  const lastIndex = distance.length - 1;
  const startM = distance[0]!;
  const totalM = distance[lastIndex]! - startM;
  if (totalM <= 0 || bandLengthM <= 0) return [];

  // Forward walk: both boundaries only ever advance, so this stays O(n).
  let index = 0;
  const bands: GradientBand[] = [];
  for (let bandStart = 0; bandStart < totalM; bandStart += bandLengthM) {
    const bandEnd = Math.min(bandStart + bandLengthM, totalM);
    const startIdx = index;
    while (index < lastIndex && distance[index]! - startM < bandEnd) index++;
    const endIdx = index;
    const run = distance[endIdx]! - distance[startIdx]!;
    if (run <= 0) continue;
    const change = altitude[endIdx]! - altitude[startIdx]!;
    bands.push({
      startM: round(distance[startIdx]! - startM, 0),
      endM: round(distance[endIdx]! - startM, 0),
      lengthM: round(run, 0),
      gradePct: round((change / run) * 100),
      elevationChangeM: round(change),
    });
  }

  // Merge a sliver of a final band into its predecessor.
  const last = bands[bands.length - 1];
  const previous = bands[bands.length - 2];
  if (
    last &&
    previous &&
    last.lengthM < bandLengthM * MIN_TRAILING_BAND_FRACTION
  ) {
    const merged = mergeBands(previous, last);
    bands.splice(bands.length - 2, 2, merged);
  }
  return bands;
}

function mergeBands(a: GradientBand, b: GradientBand): GradientBand {
  const lengthM = a.lengthM + b.lengthM;
  const elevationChangeM = round(a.elevationChangeM + b.elevationChangeM);
  return {
    startM: a.startM,
    endM: b.endM,
    lengthM,
    gradePct: lengthM > 0 ? round((elevationChangeM / lengthM) * 100) : 0,
    elevationChangeM,
  };
}

/**
 * Steepest stretch of at least `windowM`, by mean grade. The window shrinks to
 * half the course when the course is shorter than it, so a 300 m segment still
 * reports a crux rather than nothing. Returns null when nothing climbs.
 */
export function steepestWindow(
  distance: number[],
  altitude: number[],
  windowM: number = CRUX_WINDOW_M,
): SustainedStretch | null {
  const lastIndex = distance.length - 1;
  if (lastIndex < 1) return null;
  const startM = distance[0]!;
  const totalM = distance[lastIndex]! - startM;
  if (totalM <= 0) return null;

  const span = Math.min(windowM, totalM / 2);
  let best: SustainedStretch | null = null;
  let end = 0;
  for (let start = 0; start < lastIndex; start++) {
    if (end < start + 1) end = start + 1;
    while (end < lastIndex && distance[end]! - distance[start]! < span) end++;
    const run = distance[end]! - distance[start]!;
    if (run <= 0) continue;
    const change = altitude[end]! - altitude[start]!;
    const gradePct = (change / run) * 100;
    if (best !== null && gradePct <= best.gradePct) continue;
    best = {
      startM: round(distance[start]! - startM, 0),
      endM: round(distance[end]! - startM, 0),
      lengthM: round(run, 0),
      gradePct: round(gradePct),
      elevationChangeM: round(change),
      positionFraction: round(
        (distance[start]! + distance[end]! - 2 * startM) / 2 / totalM,
        3,
      ),
    };
  }
  // A course that only ever descends has no crux to warn about.
  return best !== null && best.gradePct > 0 ? best : null;
}

/**
 * Classify how the climbing is distributed, from the bands (so single-sample
 * altitude noise cannot swing the verdict). Order matters: a course has to
 * fail "no relief at all" before its gain is worth splitting into thirds.
 */
export function describeShape(
  bands: GradientBand[],
  netGradePct: number,
): ProfileShape {
  const gain = bands.reduce((s, b) => s + Math.max(0, b.elevationChangeM), 0);
  const loss = bands.reduce((s, b) => s + Math.max(0, -b.elevationChangeM), 0);

  if (
    gain < FLAT_ELEVATION_M &&
    loss < FLAT_ELEVATION_M &&
    Math.abs(netGradePct) < FLAT_GRADE_PCT
  ) {
    return "flat";
  }
  if (netGradePct < -FLAT_GRADE_PCT && loss > gain) return "descending";
  if (gain > 0 && loss > gain * ROLLING_LOSS_RATIO) return "rolling";
  if (gain <= 0) return "flat";

  const totalM = bands.reduce((s, b) => s + b.lengthM, 0);
  const thirdM = totalM / 3;
  const shares: [number, number, number] = [0, 0, 0];
  let travelled = 0;
  for (const band of bands) {
    // Attribute a band by its midpoint; bands are short relative to a third.
    const third = Math.min(
      2,
      Math.max(0, Math.floor((travelled + band.lengthM / 2) / thirdM)),
    ) as 0 | 1 | 2;
    shares[third] += Math.max(0, band.elevationChangeM);
    travelled += band.lengthM;
  }
  if (shares[0] / gain >= LOADED_GAIN_SHARE) return "front-loaded";
  if (shares[2] / gain >= LOADED_GAIN_SHARE) return "back-loaded";
  return "steady";
}

/**
 * Build the full profile. `bandLengthM` defaults to {@link chooseBandLength}
 * for the course's length.
 */
export function computeGradientProfile(
  streams: ProfileStreams,
  options: { bandLengthM?: number; cruxWindowM?: number } = {},
): GradientProfile {
  const { distance, altitude } = streams;
  if (!distance || distance.length < 2) {
    throw new GradientProfileError(
      "No distance stream is available — a gradient profile needs distance and elevation data.",
    );
  }
  if (!altitude || altitude.length !== distance.length) {
    throw new GradientProfileError(
      "No elevation stream aligned with the distance stream — a gradient profile needs both.",
    );
  }

  const lastIndex = distance.length - 1;
  const lengthM = distance[lastIndex]! - distance[0]!;
  if (lengthM <= 0) {
    throw new GradientProfileError(
      "The distance stream does not advance — there is no course to profile.",
    );
  }

  const bandLengthM = options.bandLengthM ?? chooseBandLength(lengthM);
  const bands = buildGradientBands(distance, altitude, bandLengthM);
  const netElevationChangeM = altitude[lastIndex]! - altitude[0]!;
  const avgGradePct = round((netElevationChangeM / lengthM) * 100);

  // Gain and loss come from the bands rather than per-sample deltas: summing
  // sample-to-sample rises over a barometric stream inflates the total with
  // noise, which is exactly the number people compare against Strava's.
  const elevationGainM = round(
    bands.reduce((s, b) => s + Math.max(0, b.elevationChangeM), 0),
  );
  const elevationLossM = round(
    bands.reduce((s, b) => s + Math.max(0, -b.elevationChangeM), 0),
  );

  const grades = computeGrades(streams as HillStreams);
  const climbRanges = detectSustained(grades, distance, altitude, 1);
  const climbs = climbRanges.map((range) =>
    stretchFromRange(distance, altitude, range.start, range.end, lengthM),
  );

  const warnings: string[] = [];
  if (!streams.grade_smooth) {
    warnings.push(
      "No smoothed-grade stream; grade was derived from the elevation stream.",
    );
  }
  if (climbs.length === 0 && elevationGainM >= FLAT_ELEVATION_M) {
    warnings.push(
      "No sustained climb detected (grade ≥ 2% for ≥ 200 m) — the gain here is spread out or comes in pitches shorter than that.",
    );
  }

  return {
    lengthM: Math.round(lengthM),
    elevationGainM,
    elevationLossM,
    netElevationChangeM: round(netElevationChangeM),
    minAltitudeM: round(Math.min(...altitude)),
    maxAltitudeM: round(Math.max(...altitude)),
    avgGradePct,
    bandLengthM,
    bands,
    climbs,
    steepest: steepestWindow(distance, altitude, options.cruxWindowM),
    shape: describeShape(bands, avgGradePct),
    warnings,
  };
}

function stretchFromRange(
  distance: number[],
  altitude: number[],
  start: number,
  end: number,
  totalM: number,
): SustainedStretch {
  const startM = distance[start]! - distance[0]!;
  const endM = distance[end]! - distance[0]!;
  const run = endM - startM;
  const change = altitude[end]! - altitude[start]!;
  return {
    startM: round(startM, 0),
    endM: round(endM, 0),
    lengthM: round(run, 0),
    gradePct: run > 0 ? round((change / run) * 100) : 0,
    elevationChangeM: round(change),
    positionFraction: round((startM + endM) / 2 / totalM, 3),
  };
}
