/**
 * Where time was won or lost between two efforts on the same segment.
 * Pure functions over stream slices, unit-tested next to `hillAnalysis.ts`.
 *
 * `view-segment-progress` can say you lost 8 seconds to your PR; it can never
 * say *where*. Both efforts covered the same physical course, so aligning them
 * on **distance along the segment** — not on time, which is the thing being
 * compared — turns two elapsed times into "you were 4 s up at halfway and gave
 * back 12 s on the last third". No new endpoint is needed: an effort's
 * `start_index`/`end_index` slice it straight out of its activity's
 * full-resolution streams.
 */

/** One effort's streams, already sliced to the segment and index-aligned. */
export interface EffortSlice {
  /** Seconds since the activity start (absolute; normalised here). */
  time: number[];
  /** Cumulative metres since the activity start (absolute; normalised here). */
  distance: number[];
  heartrate?: number[];
  /** Smoothed speed in m/s. */
  velocity_smooth?: number[];
  /** Strava's smoothed grade in percent. */
  grade_smooth?: number[];
}

/** Raised for slices the comparison cannot work with; message is user-facing. */
export class SegmentEffortCompareError extends Error {}

/** Thirds of the segment, the unit the summary reports. */
export type ThirdLabel = "first" | "middle" | "last";

export interface ThirdSummary {
  label: ThirdLabel;
  /** Metres into the segment where this third starts. */
  startM: number;
  endM: number;
  /** Seconds each effort spent covering this third. */
  seconds: [number, number];
  /** Seconds per km for each effort. */
  paceSecPerKm: [number | null, number | null];
  /** Mean heart rate for each effort, where recorded. */
  avgHr: [number | null, number | null];
  /** effort2 − effort1, in seconds. Positive = effort 2 was slower here. */
  deltaSeconds: number;
}

/** One sample of the cumulative time gap along the segment. */
export interface DeltaPoint {
  /** Metres into the segment. */
  distanceM: number;
  /** effort2 − effort1 elapsed at this point, in seconds. */
  deltaSeconds: number;
}

export interface SegmentEffortComparison {
  /** Distance actually shared by both efforts, in metres. */
  comparedDistanceM: number;
  /** Total elapsed seconds over the compared distance, per effort. */
  totalSeconds: [number, number];
  /** effort2 − effort1 over the compared distance. Negative = effort 2 faster. */
  totalDeltaSeconds: number;
  thirds: ThirdSummary[];
  /** Cumulative gap, sampled evenly along the segment. */
  deltaCurve: DeltaPoint[];
  /** Where effort 2's advantage peaked, and where it was worst. */
  bestForEffort2: DeltaPoint | null;
  worstForEffort2: DeltaPoint | null;
  warnings: string[];
}

/** Samples in the delta curve. Enough to see a shape, short enough to print. */
export const DELTA_CURVE_POINTS = 21;

const round = (value: number, dp = 1) =>
  Math.round(value * 10 ** dp) / 10 ** dp;

/**
 * Elapsed seconds at `metres` into the effort, linearly interpolated.
 * Distances are normalised to start at zero by the caller.
 */
function elapsedAt(
  distance: number[],
  time: number[],
  metres: number,
): number | null {
  const last = distance.length - 1;
  if (last < 1) return null;
  if (metres <= distance[0]!) return time[0]!;
  if (metres >= distance[last]!) return time[last]!;
  // Distances are non-decreasing, so binary search for the bracketing pair.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (distance[mid]! <= metres) lo = mid;
    else hi = mid;
  }
  const span = distance[hi]! - distance[lo]!;
  if (span <= 0) return time[lo]!;
  const fraction = (metres - distance[lo]!) / span;
  return time[lo]! + fraction * (time[hi]! - time[lo]!);
}

/** Mean of a stream over the samples falling inside [fromM, toM]. */
function meanOver(
  distance: number[],
  values: number[] | undefined,
  fromM: number,
  toM: number,
): number | null {
  if (!values || values.length !== distance.length) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < distance.length; i++) {
    const d = distance[i]!;
    if (d < fromM || d > toM) continue;
    const value = values[i];
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

/** Zero the time and distance so both efforts start from the same origin. */
function normalize(slice: EffortSlice): EffortSlice {
  const t0 = slice.time[0] ?? 0;
  const d0 = slice.distance[0] ?? 0;
  return {
    ...slice,
    time: slice.time.map((t) => t - t0),
    distance: slice.distance.map((d) => d - d0),
  };
}

function validate(slice: EffortSlice, label: string): void {
  if (!slice.time || !slice.distance || slice.time.length < 2) {
    throw new SegmentEffortCompareError(
      `The ${label} effort has fewer than two recorded samples on this segment, so there is nothing to compare.`,
    );
  }
  if (slice.time.length !== slice.distance.length) {
    throw new SegmentEffortCompareError(
      `The ${label} effort's time and distance streams are misaligned.`,
    );
  }
}

/**
 * Compare two efforts on the same segment.
 *
 * Both are aligned on distance into the segment and compared only over the
 * distance they share: a GPS-short effort simply ends the comparison early
 * rather than inventing samples, and the shortfall is reported as a warning.
 */
export function compareEffortSlices(
  effort1: EffortSlice,
  effort2: EffortSlice,
  options: { curvePoints?: number } = {},
): SegmentEffortComparison {
  validate(effort1, "first");
  validate(effort2, "second");

  const a = normalize(effort1);
  const b = normalize(effort2);

  const lengthA = a.distance[a.distance.length - 1]!;
  const lengthB = b.distance[b.distance.length - 1]!;
  const comparedDistanceM = Math.min(lengthA, lengthB);
  if (comparedDistanceM <= 0) {
    throw new SegmentEffortCompareError(
      "Neither effort recorded any distance on this segment, so they cannot be compared.",
    );
  }

  const warnings: string[] = [];
  const shortfall = Math.abs(lengthA - lengthB);
  // 2% of a segment is inside GPS noise; beyond that the shorter recording is
  // genuinely missing part of the course and the totals are not like-for-like.
  if (shortfall > comparedDistanceM * 0.02) {
    warnings.push(
      `The efforts recorded different distances (${Math.round(lengthA)} m and ${Math.round(lengthB)} m); they are compared over the ${Math.round(comparedDistanceM)} m they share.`,
    );
  }

  const at = (slice: EffortSlice, metres: number) =>
    elapsedAt(slice.distance, slice.time, metres) ?? 0;

  const totalSeconds: [number, number] = [
    round(at(a, comparedDistanceM)),
    round(at(b, comparedDistanceM)),
  ];

  const thirdLabels: ThirdLabel[] = ["first", "middle", "last"];
  const thirds: ThirdSummary[] = thirdLabels.map((label, index) => {
    const startM = (comparedDistanceM * index) / 3;
    const endM = (comparedDistanceM * (index + 1)) / 3;
    const lengthKm = (endM - startM) / 1000;
    const secondsA = at(a, endM) - at(a, startM);
    const secondsB = at(b, endM) - at(b, startM);
    const paceOf = (seconds: number) =>
      lengthKm > 0 && seconds > 0 ? Math.round(seconds / lengthKm) : null;
    return {
      label,
      startM: Math.round(startM),
      endM: Math.round(endM),
      seconds: [round(secondsA), round(secondsB)],
      paceSecPerKm: [paceOf(secondsA), paceOf(secondsB)],
      avgHr: [
        roundOrNull(meanOver(a.distance, a.heartrate, startM, endM), 0),
        roundOrNull(meanOver(b.distance, b.heartrate, startM, endM), 0),
      ],
      deltaSeconds: round(secondsB - secondsA),
    };
  });

  const points = Math.max(2, options.curvePoints ?? DELTA_CURVE_POINTS);
  const deltaCurve: DeltaPoint[] = [];
  for (let i = 0; i < points; i++) {
    const metres = (comparedDistanceM * i) / (points - 1);
    deltaCurve.push({
      distanceM: Math.round(metres),
      deltaSeconds: round(at(b, metres) - at(a, metres)),
    });
  }

  // The first point is always a zero gap, so it is not a meaningful extreme.
  const interior = deltaCurve.slice(1);
  const bestForEffort2 =
    interior.reduce<DeltaPoint | null>(
      (best, point) =>
        best === null || point.deltaSeconds < best.deltaSeconds ? point : best,
      null,
    ) ?? null;
  const worstForEffort2 =
    interior.reduce<DeltaPoint | null>(
      (worst, point) =>
        worst === null || point.deltaSeconds > worst.deltaSeconds
          ? point
          : worst,
      null,
    ) ?? null;

  if (!a.heartrate || !b.heartrate) {
    warnings.push(
      "Heart rate is missing from at least one effort, so the per-third HR comparison is incomplete.",
    );
  }

  return {
    comparedDistanceM: Math.round(comparedDistanceM),
    totalSeconds,
    totalDeltaSeconds: round(totalSeconds[1] - totalSeconds[0]),
    thirds,
    deltaCurve,
    bestForEffort2,
    worstForEffort2,
    warnings,
  };
}

function roundOrNull(value: number | null, dp: number): number | null {
  return value == null ? null : round(value, dp);
}

/**
 * Slice an effort out of its activity's full-resolution streams.
 *
 * Strava's `start_index`/`end_index` index the full-resolution stream, which is
 * why the caller must fetch without a `resolution` parameter. Returns null when
 * the indices do not describe a usable window.
 */
export function sliceEffort(
  streams: {
    time?: number[];
    distance?: number[];
    heartrate?: number[];
    velocity_smooth?: number[];
    grade_smooth?: number[];
  },
  startIndex: number | null | undefined,
  endIndex: number | null | undefined,
): EffortSlice | null {
  const { time, distance } = streams;
  if (!time || !distance || time.length !== distance.length) return null;
  if (startIndex == null || endIndex == null) return null;
  const from = Math.max(0, Math.min(startIndex, time.length - 1));
  const to = Math.min(time.length - 1, Math.max(endIndex, 0));
  if (to - from < 1) return null;

  const cut = (values: number[] | undefined) =>
    values && values.length === time.length
      ? values.slice(from, to + 1)
      : undefined;

  return {
    time: time.slice(from, to + 1),
    distance: distance.slice(from, to + 1),
    ...(cut(streams.heartrate) ? { heartrate: cut(streams.heartrate)! } : {}),
    ...(cut(streams.velocity_smooth)
      ? { velocity_smooth: cut(streams.velocity_smooth)! }
      : {}),
    ...(cut(streams.grade_smooth)
      ? { grade_smooth: cut(streams.grade_smooth)! }
      : {}),
  };
}
