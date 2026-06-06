import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type StravaDetailedActivity, type StravaStats } from "../stravaClient";
import {
  ActivityDetailsOutputSchema,
  AthleteStatsOutputSchema,
  AthleteZonesOutputSchema,
  BestEffortsOutputSchema,
  buildActivityDetailsOutput,
  buildAthleteStatsOutput,
  CompareActivitiesOutputSchema,
  RunningSummaryOutputSchema,
  TrainingLoadOutputSchema,
} from "./outputs";

describe("buildActivityDetailsOutput", () => {
  it("maps an activity to a JSON-safe, schema-valid object", () => {
    const activity = {
      id: 3503400000123456789n,
      name: "Morning Run",
      type: "Run",
      sport_type: "Run",
      start_date: "2026-05-01T06:00:00Z",
      distance: 10000,
      moving_time: 3000,
      elapsed_time: 3100,
      total_elevation_gain: 120,
      average_speed: 3.33,
      max_speed: 4.1,
      average_heartrate: 150,
      max_heartrate: 172,
      average_cadence: 88,
      average_watts: null,
      max_watts: null,
      calories: 600,
      gear: { id: "g123", name: "Pegasus" },
    } as unknown as StravaDetailedActivity;

    const out = buildActivityDetailsOutput(activity);
    expect(out.id).toBe("3503400000123456789");
    expect(out.distance_m).toBe(10000);
    expect(out.gear).toEqual({ id: "g123", name: "Pegasus" });
    expect(ActivityDetailsOutputSchema.safeParse(out).success).toBe(true);
  });

  it("yields null for distance_m and moving_time_s when absent from source", () => {
    const activity = {
      id: 9999n,
      name: "Stationary Workout",
      type: "WeightTraining",
      sport_type: "WeightTraining",
      start_date: "2026-06-01T10:00:00Z",
      elapsed_time: 1800,
      total_elevation_gain: 0,
    } as unknown as StravaDetailedActivity;

    const out = buildActivityDetailsOutput(activity);
    expect(out.distance_m).toBeNull();
    expect(out.moving_time_s).toBeNull();
    expect(ActivityDetailsOutputSchema.safeParse(out).success).toBe(true);
  });
});

describe("buildAthleteStatsOutput", () => {
  it("flattens totals to schema-valid shape", () => {
    const stats = {
      recent_run_totals: {
        count: 4,
        distance: 40000,
        moving_time: 12000,
        elevation_gain: 300,
      },
      biggest_ride_distance: 80000,
    } as unknown as StravaStats;

    const out = buildAthleteStatsOutput(stats);
    expect(out.recent_run_totals).toEqual({
      count: 4,
      distance_m: 40000,
      moving_time_s: 12000,
      elevation_gain_m: 300,
    });
    expect(out.ytd_run_totals).toBeNull();
    expect(out.biggest_ride_distance_m).toBe(80000);
    expect(AthleteStatsOutputSchema.safeParse(out).success).toBe(true);
  });
});

describe("output schemas convert to JSON schema", () => {
  const schemas = {
    ActivityDetailsOutputSchema,
    AthleteStatsOutputSchema,
    AthleteZonesOutputSchema,
    TrainingLoadOutputSchema,
    RunningSummaryOutputSchema,
    CompareActivitiesOutputSchema,
    BestEffortsOutputSchema,
  };
  for (const [name, schema] of Object.entries(schemas)) {
    it(`converts ${name}`, () => {
      expect(() => z.toJSONSchema(schema)).not.toThrow();
    });
  }
});
