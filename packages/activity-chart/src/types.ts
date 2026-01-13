/** Lap data from Strava API */
export interface Lap {
  name: string;
  startIndex: number;
  endIndex: number;
  distance: number;
  elapsedTime: number;
  averageSpeed: number | null;
  averageHeartrate: number | null;
  lapIndex: number;
}

/** Raw data from the server's get-activity-streams-raw tool */
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
  laps?: Lap[];
}

/** The 6 chart metric keys */
export type MetricKey =
  | "heartrate"
  | "power"
  | "pace"
  | "altitude"
  | "cadence"
  | "grade";

/** Normalized data point for Recharts */
export interface ChartDataPoint {
  time: number;
  timeFormatted: string;
  distance?: number;
  heartrate?: number;
  power?: number;
  pace?: number;
  altitude?: number;
  cadence?: number;
  grade?: number;
}

/** Display metadata for the activity */
export interface ActivityMeta {
  name: string;
  activityType: string;
  isRunning: boolean;
  isSwimming: boolean;
}
