/**
 * Raw data from the server's get-activity-streams-raw tool (cross-app reuse;
 * the compare overlay ignores the lap payload that tool also returns).
 */
export interface ActivityStreamData {
  activityId: number;
  activityType: string;
  name: string;
  streams: {
    time?: number[];
    heartrate?: number[];
    watts?: number[];
    velocity_smooth?: number[];
    altitude?: number[];
    cadence?: number[];
    grade_smooth?: number[];
    distance?: number[];
  };
}

/** One side of the get-compare-activities-data payload. */
export interface CompareSide {
  id: string;
  name: string;
  date: string;
  type: string;
  distance_km: number;
  time_formatted: string;
  pace: {
    min_per_km: string;
    min_per_mile: string;
    raw_min_per_km: number;
  } | null;
  avg_hr: number | null;
  max_hr: number | null;
  cadence_spm: number | null;
  elevation_gain_m: number;
}

/** Aggregate comparison from the server's get-compare-activities-data tool. */
export interface CompareData {
  activity_1: CompareSide;
  activity_2: CompareSide;
  differences: {
    distance_km: number;
    pace: { seconds_per_km: number; interpretation: string } | null;
    avg_hr: number | null;
    cadence_spm: number | null;
    elevation_gain_m: number;
  };
  efficiency: {
    activity_1: number;
    activity_2: number;
    change_percent: number;
    interpretation: string;
    note: string;
  } | null;
  warnings?: string[];
}

/** Metrics the overlay can plot (must be present in both activities). */
export type MetricKey = "pace" | "heartrate" | "power" | "cadence" | "altitude";

/** Shared x-axis the two activities are aligned on. */
export type AxisKey = "distance" | "time";

/** One resampled point on the shared axis; `a` = activity 1, `b` = activity 2. */
export interface AlignedPoint {
  x: number;
  aPace?: number;
  bPace?: number;
  aHeartrate?: number;
  bHeartrate?: number;
  aPower?: number;
  bPower?: number;
  aCadence?: number;
  bCadence?: number;
  aAltitude?: number;
  bAltitude?: number;
}
