/** Summary data for a single run, returned by get-cadence-trend-data */
export interface RunSummary {
  id: number;
  name: string;
  date: string;
  distance: number;
  duration: number;
  averageCadence: number;
  averagePace: number;
  type: string;
}

/** Response from get-cadence-trend-data tool */
export interface CadenceTrendData {
  weeks: number;
  activities: RunSummary[];
}

/** Stream data for a single run used in overlay view (reuses activity-chart shape) */
export interface OverlayStreamData {
  activityId: number;
  activityType: string;
  name: string;
  streams: {
    time?: number[];
    distance?: number[];
    cadence?: number[];
    velocity_smooth?: number[];
  };
}

/** A single point in the overlay chart */
export interface OverlayPoint {
  distance: number;
  time: number;
  cadence?: number;
  pace?: number;
}

/** Pace zone definition */
export interface PaceZone {
  label: string;
  minPace: number;
  maxPace: number;
}

/** View identifiers */
export type ViewId = "trend" | "scatter" | "zones" | "overlay";
