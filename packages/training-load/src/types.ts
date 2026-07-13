/** One week of training volume, returned by get-training-load-data. */
export interface WeekSummary {
  /** Monday-start week key, YYYY-MM-DD. */
  weekStarting: string;
  runs: number;
  distanceKm: number;
  timeHours: number;
  elevationM: number;
  /** Rolling-average volume for the trend line, in km. */
  trendKm: number;
  warning: boolean;
  warningReasons: string[];
}

/** Response from the get-training-load-data tool. */
export interface TrainingLoadData {
  days: number;
  totals: {
    runs: number;
    distanceKm: number;
    timeHours: number;
    elevationM: number;
  };
  weeks: WeekSummary[];
}
