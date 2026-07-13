import { describe, expect, it } from "vitest";
import { buildCompareContextSummary } from "./contextSummary";
import { type CompareData } from "./types";

const compare: CompareData = {
  activity_1: {
    id: "1",
    name: "Morning Run",
    date: "2026-06-01",
    type: "Run",
    distance_km: 10,
    time_formatted: "50:00",
    pace: { min_per_km: "5:00", min_per_mile: "8:03", raw_min_per_km: 5 },
    avg_hr: 150,
    max_hr: 175,
    cadence_spm: 170,
    elevation_gain_m: 80,
  },
  activity_2: {
    id: "2",
    name: "Race Day",
    date: "2026-06-15",
    type: "Run",
    distance_km: 10,
    time_formatted: "48:00",
    pace: { min_per_km: "4:48", min_per_mile: "7:44", raw_min_per_km: 4.8 },
    avg_hr: 158,
    max_hr: 182,
    cadence_spm: 174,
    elevation_gain_m: 78,
  },
  differences: {
    distance_km: 0,
    pace: { seconds_per_km: -12, interpretation: "faster" },
    avg_hr: 8,
    cadence_spm: 4,
    elevation_gain_m: -2,
  },
  efficiency: null,
};

describe("buildCompareContextSummary", () => {
  it("names both activities, the overlay state, and the headline deltas", () => {
    const text = buildCompareContextSummary({
      compare,
      metric: "heartrate",
      axis: "distance",
    });
    expect(text).toContain('"Morning Run" (2026-06-01)');
    expect(text).toContain('"Race Day" (2026-06-15)');
    expect(text).toContain("Overlay: heart rate vs distance.");
    expect(text).toContain("pace -12 s/km (faster)");
    expect(text).toContain("avg HR +8 bpm");
  });

  it("uses the provided pace label for mixed pairs", () => {
    const text = buildCompareContextSummary({
      compare,
      metric: "pace",
      axis: "time",
      paceLabel: "speed",
    });
    expect(text).toContain("Overlay: speed vs time.");
  });

  it("returns null before data arrives", () => {
    expect(
      buildCompareContextSummary({
        compare: null,
        metric: "pace",
        axis: "distance",
      }),
    ).toBeNull();
    expect(
      buildCompareContextSummary({ compare, metric: null, axis: "distance" }),
    ).toBeNull();
  });
});
