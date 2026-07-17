/** One zone bucket, as returned by get-activity-zones-data. */
export interface ZoneBucket {
  /** 1-based zone number (Z1 = 1). */
  zone: number;
  /** Lower bound in the set's unit (bpm or W). */
  min: number;
  /** Upper bound, or null for the open-ended top zone. */
  max: number | null;
  seconds: number;
  /** Share of the set's total time, 0–100 with one decimal. */
  pct: number;
}

/** One zone distribution (heart rate or power). */
export interface ZoneSet {
  type: "heartrate" | "power";
  unit: "bpm" | "W";
  sensorBased: boolean | null;
  totalSeconds: number;
  buckets: ZoneBucket[];
}

/** Response from the get-activity-zones-data tool. */
export interface ActivityZonesData {
  activityId: string;
  name: string;
  /** Local start date, ISO. */
  date: string;
  type: string;
  zoneSets: ZoneSet[];
}
