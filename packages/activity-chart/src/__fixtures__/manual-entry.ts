import { type ActivityStreamData } from "../types";

/**
 * A manually-entered activity: Strava knows the name, sport, and duration,
 * but there is no device recording behind it, so every stream is absent.
 * Treadmill uploads and activities with device data stripped land here too.
 */
export const manualEntry: ActivityStreamData = {
  activityId: 15920083311,
  activityType: "WeightTraining",
  name: "Evening Strength Session",
  streams: {},
};

/**
 * The subtler no-data case: a recording exists, but the only stream is the
 * time axis. It parses into chart points that carry no plottable series, so
 * the metric-availability scan is what has to catch it, not `data.length`.
 */
export const timeOnlyRecording: ActivityStreamData = {
  activityId: 15920083312,
  activityType: "Run",
  name: "Treadmill Shakeout",
  streams: {
    time: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300],
  },
};
