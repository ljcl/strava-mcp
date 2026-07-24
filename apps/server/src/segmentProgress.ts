/**
 * Pure segment-effort history aggregation shared by the
 * `view-segment-progress` text summary and the `get-segment-progress-data`
 * MCP App feed (#184). Strava's segment *leaderboard* endpoints are dead at
 * the API level, so the athlete's own repeated efforts are the only
 * progression signal available — this module turns them into a chronological
 * series plus the derived summary both surfaces render, so the chart and the
 * prose can never drift.
 */
import { type StravaDetailedSegment } from "./stravaClient";
import { isRunningActivity } from "./utils/running";

/** The slice of a Strava DetailedSegmentEffort this aggregation reads. */
export interface SegmentEffortInput {
  id: number | string;
  activity?: { id: number | string } | null;
  start_date_local: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
  average_cadence?: number | null;
  pr_rank?: number | null;
  kom_rank?: number | null;
}

/** Segment identity/difficulty, for the app header and narration. */
export interface SegmentProgressSegment {
  id: string;
  name: string;
  activityType: string | null;
  distanceMeters: number;
  averageGrade: number | null;
  maximumGrade: number | null;
  elevationGain: number | null;
  climbCategory: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  starred: boolean;
}

/** One effort on the segment, in the app's row shape. */
export interface SegmentProgressEffort {
  id: string;
  activityId: string | null;
  /** Local start date of the effort (ISO 8601). */
  date: string;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  /** Elapsed seconds per km; null when the effort recorded no distance. */
  paceSecondsPerKm: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  deviceWatts: boolean;
  /** Steps/min on run segments (doubled), revolutions/min elsewhere. */
  averageCadence: number | null;
  /** Strava's own achievement ranks for the effort, when present. */
  prRank: number | null;
  komRank: number | null;
  /** 1-based rank by elapsed time within this history (1 = fastest). */
  rank: number;
}

/** Mean time and heart rate over one chronological half of the history. */
export interface SegmentProgressHalf {
  count: number;
  avgSeconds: number;
  /** Mean of the efforts in this half that recorded heart rate. */
  avgHeartrate: number | null;
  firstDate: string;
  lastDate: string;
}

export interface SegmentProgressSummary {
  effortCount: number;
  firstDate: string | null;
  lastDate: string | null;
  bestSeconds: number | null;
  bestDate: string | null;
  latestSeconds: number | null;
  latestDate: string | null;
  /** Latest − best, in seconds; 0 when the latest effort IS the best. */
  latestVsBestSeconds: number | null;
  medianSeconds: number | null;
  /** Efforts carrying an average heart rate. */
  heartrateEffortCount: number;
  /**
   * Chronological halves of the history, present from 4 efforts up. Their
   * deltas carry the "same time at a lower heart rate" read that a single
   * time series cannot show.
   */
  early: SegmentProgressHalf | null;
  recent: SegmentProgressHalf | null;
  /** recent − early mean time, in seconds (negative = getting faster). */
  avgSecondsDelta: number | null;
  /** recent − early mean HR, in bpm (negative = same work, less strain). */
  avgHeartrateDelta: number | null;
}

/** Payload returned by `get-segment-progress-data` and parsed by the app. */
export interface SegmentProgressData {
  segment: SegmentProgressSegment;
  /** Efforts oldest-first, so the chart's x axis reads left to right. */
  efforts: SegmentProgressEffort[];
  summary: SegmentProgressSummary;
}

/** Halves are only meaningful once each side has two efforts to average. */
const MIN_EFFORTS_FOR_HALVES = 4;

function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Mean of the defined values, or null when none of them exist. */
function meanOrNull(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length === 0 ? null : mean(present);
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function summarizeHalf(efforts: SegmentProgressEffort[]): SegmentProgressHalf {
  const hr = meanOrNull(efforts.map((e) => e.averageHeartrate));
  return {
    count: efforts.length,
    avgSeconds: round(mean(efforts.map((e) => e.elapsedSeconds))),
    avgHeartrate: hr == null ? null : round(hr),
    firstDate: efforts[0]!.date,
    lastDate: efforts[efforts.length - 1]!.date,
  };
}

/**
 * Derive the summary both surfaces render from the chronological efforts.
 * Exported for the tests; `buildSegmentProgress` is the normal entry point.
 */
export function summarizeSegmentProgress(
  efforts: SegmentProgressEffort[],
): SegmentProgressSummary {
  const empty: SegmentProgressSummary = {
    effortCount: 0,
    firstDate: null,
    lastDate: null,
    bestSeconds: null,
    bestDate: null,
    latestSeconds: null,
    latestDate: null,
    latestVsBestSeconds: null,
    medianSeconds: null,
    heartrateEffortCount: 0,
    early: null,
    recent: null,
    avgSecondsDelta: null,
    avgHeartrateDelta: null,
  };
  if (efforts.length === 0) return empty;

  const best = efforts.reduce((fastest, e) =>
    e.elapsedSeconds < fastest.elapsedSeconds ? e : fastest,
  );
  const latest = efforts[efforts.length - 1]!;
  const times = efforts.map((e) => e.elapsedSeconds).sort((a, b) => a - b);

  let early: SegmentProgressHalf | null = null;
  let recent: SegmentProgressHalf | null = null;
  if (efforts.length >= MIN_EFFORTS_FOR_HALVES) {
    // Odd counts drop the middle effort so neither half is weighted by it.
    const half = Math.floor(efforts.length / 2);
    early = summarizeHalf(efforts.slice(0, half));
    recent = summarizeHalf(efforts.slice(efforts.length - half));
  }

  return {
    effortCount: efforts.length,
    firstDate: efforts[0]!.date,
    lastDate: latest.date,
    bestSeconds: best.elapsedSeconds,
    bestDate: best.date,
    latestSeconds: latest.elapsedSeconds,
    latestDate: latest.date,
    latestVsBestSeconds: latest.elapsedSeconds - best.elapsedSeconds,
    medianSeconds: round(median(times), 1),
    heartrateEffortCount: efforts.filter((e) => e.averageHeartrate != null)
      .length,
    early,
    recent,
    avgSecondsDelta:
      early && recent ? round(recent.avgSeconds - early.avgSeconds) : null,
    avgHeartrateDelta:
      early?.avgHeartrate != null && recent?.avgHeartrate != null
        ? round(recent.avgHeartrate - early.avgHeartrate)
        : null,
  };
}

/**
 * Map one segment plus the athlete's efforts on it into the app payload.
 * Efforts are sorted oldest-first (Strava returns them newest-first) and
 * ranked by elapsed time, so the app can highlight the PR and the top three
 * without re-deriving them. Running cadence is doubled to steps-per-minute
 * here, matching `mapActivitySegments`; other sports stay raw (rpm). Null
 * metrics pass through so the app renders "no data" rather than a zero.
 */
export function buildSegmentProgress(
  segment: StravaDetailedSegment,
  efforts: SegmentEffortInput[],
): SegmentProgressData {
  const activityType = segment.activity_type ?? null;
  const doublesCadence = activityType ? isRunningActivity(activityType) : false;

  const chronological = [...efforts].sort(
    (a, b) =>
      new Date(a.start_date_local).getTime() -
      new Date(b.start_date_local).getTime(),
  );

  // Rank by elapsed time; equal times keep chronological order, so the
  // earliest of two identical efforts is the one that reads as the PR.
  const rankById = new Map<string, number>();
  [...chronological]
    .sort((a, b) => a.elapsed_time - b.elapsed_time)
    .forEach((effort, index) => {
      rankById.set(String(effort.id), index + 1);
    });

  const rows: SegmentProgressEffort[] = chronological.map((e) => {
    const id = String(e.id);
    const cadence = e.average_cadence ?? null;
    return {
      id,
      activityId: e.activity?.id == null ? null : String(e.activity.id),
      date: e.start_date_local,
      elapsedSeconds: e.elapsed_time,
      movingSeconds: e.moving_time,
      distanceMeters: e.distance,
      paceSecondsPerKm:
        e.distance > 0 ? round(e.elapsed_time / (e.distance / 1000), 1) : null,
      averageHeartrate: e.average_heartrate ?? null,
      maxHeartrate: e.max_heartrate ?? null,
      averageWatts: e.average_watts ?? null,
      deviceWatts: e.device_watts === true,
      averageCadence:
        cadence == null ? null : doublesCadence ? cadence * 2 : cadence,
      prRank: e.pr_rank ?? null,
      komRank: e.kom_rank ?? null,
      rank: rankById.get(id) ?? 1,
    };
  });

  return {
    segment: {
      id: String(segment.id),
      name: segment.name,
      activityType,
      distanceMeters: segment.distance,
      averageGrade: segment.average_grade ?? null,
      maximumGrade: segment.maximum_grade ?? null,
      elevationGain: segment.total_elevation_gain ?? null,
      climbCategory: segment.climb_category ?? null,
      city: segment.city ?? null,
      state: segment.state ?? null,
      country: segment.country ?? null,
      starred: segment.starred === true,
    },
    efforts: rows,
    summary: summarizeSegmentProgress(rows),
  };
}
