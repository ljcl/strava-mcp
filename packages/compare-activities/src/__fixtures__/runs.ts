import { type ActivityStreamData, type CompareData } from "../types";

interface SynthRunOptions {
  activityId: number;
  name: string;
  /** Total duration in seconds (15 s sampling). */
  seconds: number;
  /** Base speed in m/s. */
  mps: number;
  hrBase: number;
  /** Strides/min as Strava reports it (half of steps/min). */
  cadenceBase: number;
  wattsBase: number;
}

/**
 * Deterministic synthetic run (sine-modulated around the bases) so stories
 * and Chromatic snapshots never drift.
 */
function synthRun(options: SynthRunOptions): ActivityStreamData {
  const { activityId, name, seconds, mps, hrBase, cadenceBase, wattsBase } =
    options;
  const samples = Math.floor(seconds / 15) + 1;
  const time: number[] = [];
  const velocity: number[] = [];
  const heartrate: number[] = [];
  const cadence: number[] = [];
  const watts: number[] = [];
  const altitude: number[] = [];
  const distance: number[] = [];

  let metres = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = i * 15;
    const warmup = Math.min(1, t / 300);
    const surge = 0.2 * Math.sin(t / 180) + 0.08 * Math.sin(t / 47);
    const v = Math.max(0.8, mps * (0.9 + 0.1 * warmup) + surge);
    time.push(t);
    velocity.push(Math.round(v * 1000) / 1000);
    heartrate.push(
      Math.round(hrBase - 18 * (1 - warmup) + 6 * Math.sin(t / 400)),
    );
    cadence.push(Math.round(cadenceBase + 2 * Math.sin(t / 500)));
    watts.push(Math.round(wattsBase * (0.92 + 0.08 * warmup) + 20 * surge));
    altitude.push(Math.round((22 + 9 * Math.sin(t / 320)) * 10) / 10);
    distance.push(Math.round(metres));
    metres += v * 15;
  }

  return {
    activityId,
    activityType: "Run",
    name,
    streams: {
      time,
      velocity_smooth: velocity,
      heartrate,
      cadence,
      watts,
      altitude,
      distance,
    },
  };
}

export const baselineRun = synthRun({
  activityId: 101,
  name: "Bay Run • Steady",
  seconds: 3150,
  mps: 3.17,
  hrBase: 156,
  cadenceBase: 84,
  wattsBase: 255,
});

export const raceRun = synthRun({
  activityId: 102,
  name: "Bay Run • Race Pace",
  seconds: 3000,
  mps: 3.33,
  hrBase: 164,
  cadenceBase: 87,
  wattsBase: 272,
});

export const compareData: CompareData = {
  activity_1: {
    id: "101",
    name: "Bay Run • Steady",
    date: "2026-06-01",
    type: "Run",
    distance_km: 9.98,
    time_formatted: "52:30",
    pace: { min_per_km: "5:16", min_per_mile: "8:28", raw_min_per_km: 5.26 },
    avg_hr: 156,
    max_hr: 172,
    cadence_spm: 168,
    elevation_gain_m: 84,
  },
  activity_2: {
    id: "102",
    name: "Bay Run • Race Pace",
    date: "2026-06-15",
    type: "Run",
    distance_km: 9.99,
    time_formatted: "50:00",
    pace: { min_per_km: "5:00", min_per_mile: "8:03", raw_min_per_km: 5.01 },
    avg_hr: 164,
    max_hr: 181,
    cadence_spm: 174,
    elevation_gain_m: 82,
  },
  differences: {
    distance_km: 0.01,
    pace: { seconds_per_km: -15, interpretation: "faster" },
    avg_hr: 8,
    cadence_spm: 6,
    elevation_gain_m: -2,
  },
  efficiency: {
    activity_1: 3.372,
    activity_2: 3.055,
    change_percent: -9.4,
    interpretation: "improved",
    note: "Lower efficiency number = faster pace at same heart rate = better fitness",
  },
};

/** HR-only pair (e.g. treadmill without footpod): time axis, single metric. */
export const hrOnlyPair: [ActivityStreamData, ActivityStreamData] = [
  {
    activityId: 201,
    activityType: "Run",
    name: "Treadmill Intervals",
    streams: {
      time: baselineRun.streams.time,
      heartrate: baselineRun.streams.heartrate,
    },
  },
  {
    activityId: 202,
    activityType: "Run",
    name: "Treadmill Tempo",
    streams: {
      time: raceRun.streams.time,
      heartrate: raceRun.streams.heartrate,
    },
  },
];
