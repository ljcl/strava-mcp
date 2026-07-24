/** Segment identity and difficulty, from get-segment-progress-data. */
export interface SegmentSummary {
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

/** One of the athlete's efforts on the segment. */
export interface SegmentEffort {
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
  /** Steps/min on run segments, revolutions/min elsewhere. */
  averageCadence: number | null;
  prRank: number | null;
  komRank: number | null;
  /** 1-based rank by elapsed time within this history (1 = fastest). */
  rank: number;
}

/** Mean time and heart rate over one chronological half of the history. */
export interface ProgressHalf {
  count: number;
  avgSeconds: number;
  avgHeartrate: number | null;
  firstDate: string;
  lastDate: string;
}

export interface ProgressSummary {
  effortCount: number;
  firstDate: string | null;
  lastDate: string | null;
  bestSeconds: number | null;
  bestDate: string | null;
  latestSeconds: number | null;
  latestDate: string | null;
  latestVsBestSeconds: number | null;
  medianSeconds: number | null;
  heartrateEffortCount: number;
  early: ProgressHalf | null;
  recent: ProgressHalf | null;
  /** recent − early mean time, in seconds (negative = getting faster). */
  avgSecondsDelta: number | null;
  /** recent − early mean HR, in bpm (negative = same work, less strain). */
  avgHeartrateDelta: number | null;
}

/** Response from the get-segment-progress-data tool. */
export interface SegmentProgressData {
  segment: SegmentSummary;
  /** Efforts oldest-first. */
  efforts: SegmentEffort[];
  summary: ProgressSummary;
}

export interface ToolArgs {
  segment_id?: string;
  start_date_local?: string;
  end_date_local?: string;
}
