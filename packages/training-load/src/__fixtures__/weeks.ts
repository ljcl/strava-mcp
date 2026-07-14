import { type TrainingLoadData, type WeekSummary } from "../types";

/**
 * 12 weeks of build with one skipped week, a >30% spike week, and an
 * unusually-high peak week — exercises the trend line, the zero-fill row,
 * and both warning rules.
 */
export const mockWeeks: WeekSummary[] = [
  {
    weekStarting: "2026-03-30",
    runs: 3,
    distanceKm: 24.5,
    timeHours: 2.45,
    elevationM: 180,
    trendKm: 26.1,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-04-06",
    runs: 4,
    distanceKm: 27.8,
    timeHours: 2.8,
    elevationM: 210,
    trendKm: 27.4,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-04-13",
    runs: 4,
    distanceKm: 30.1,
    timeHours: 3.05,
    elevationM: 240,
    trendKm: 29.5,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-04-20",
    runs: 4,
    distanceKm: 30.5,
    timeHours: 3.1,
    elevationM: 220,
    trendKm: 24.9,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-04-27",
    runs: 0,
    distanceKm: 0,
    timeHours: 0,
    elevationM: 0,
    trendKm: 21.5,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-05-04",
    runs: 4,
    distanceKm: 34,
    timeHours: 3.4,
    elevationM: 260,
    trendKm: 23.7,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-05-11",
    runs: 5,
    distanceKm: 37.2,
    timeHours: 3.75,
    elevationM: 300,
    trendKm: 36.1,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-05-18",
    runs: 5,
    distanceKm: 37,
    timeHours: 3.7,
    elevationM: 280,
    trendKm: 42.6,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-05-25",
    runs: 6,
    distanceKm: 53.5,
    timeHours: 5.4,
    elevationM: 420,
    trendKm: 43.6,
    warning: true,
    warningReasons: [
      "Volume increased 45% from previous week - consider injury risk",
      "Unusually high volume (53.5 km vs 33 km average)",
    ],
  },
  {
    weekStarting: "2026-06-01",
    runs: 4,
    distanceKm: 40.3,
    timeHours: 4.05,
    elevationM: 310,
    trendKm: 41.2,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-06-08",
    runs: 4,
    distanceKm: 29.8,
    timeHours: 3,
    elevationM: 230,
    trendKm: 34.3,
    warning: false,
    warningReasons: [],
  },
  {
    weekStarting: "2026-06-15",
    runs: 4,
    distanceKm: 32.9,
    timeHours: 3.3,
    elevationM: 250,
    trendKm: 31.4,
    warning: false,
    warningReasons: [],
  },
];

/** Full data payload matching the mock weeks, for App-level stories. */
export const mockTrainingLoadData: TrainingLoadData = {
  days: 84,
  totals: {
    runs: mockWeeks.reduce((sum, w) => sum + w.runs, 0),
    distanceKm:
      Math.round(mockWeeks.reduce((sum, w) => sum + w.distanceKm, 0) * 100) /
      100,
    timeHours:
      Math.round(mockWeeks.reduce((sum, w) => sum + w.timeHours, 0) * 100) /
      100,
    elevationM: mockWeeks.reduce((sum, w) => sum + w.elevationM, 0),
  },
  weeks: mockWeeks,
};
