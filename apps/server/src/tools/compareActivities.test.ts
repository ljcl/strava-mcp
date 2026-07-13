import { describe, expect, it } from "vitest";
import { type StravaDetailedActivity } from "../stravaClient";
import { buildComparison } from "./compareActivities";
import { CompareActivitiesOutputSchema } from "./outputs";

/**
 * Build a minimal detailed activity from a partial. Only the fields the
 * comparison reads matter; we cast through unknown so tests stay terse
 * rather than constructing every required schema field.
 */
function fakeActivity(
  overrides: Partial<StravaDetailedActivity>,
): StravaDetailedActivity {
  return {
    id: "100",
    name: "Morning Run",
    type: "Run",
    sport_type: "Run",
    start_date_local: "2026-06-01T07:00:00Z",
    distance: 10000,
    moving_time: 3200,
    average_speed: 3.125, // 5:20 min/km
    average_heartrate: 150,
    max_heartrate: 172,
    average_cadence: 84,
    total_elevation_gain: 80,
    ...overrides,
  } as unknown as StravaDetailedActivity;
}

const faster = fakeActivity({
  id: "200",
  name: "Race Day",
  start_date_local: "2026-06-15T07:00:00Z",
  moving_time: 3000,
  average_speed: 3.3333, // 5:00 min/km
  average_heartrate: 160,
  average_cadence: 87,
  total_elevation_gain: 78,
});

describe("buildComparison", () => {
  it("computes activity2 − activity1 differences with interpretations", () => {
    const result = buildComparison(fakeActivity({}), faster);

    expect(result.activity_1.name).toBe("Morning Run");
    expect(result.activity_2.name).toBe("Race Day");
    expect(result.differences.pace?.seconds_per_km).toBeLessThan(-5);
    expect(result.differences.pace?.interpretation).toBe("faster");
    expect(result.differences.avg_hr).toBe(10);
    expect(result.differences.cadence_spm).toBe(6);
    expect(result.differences.elevation_gain_m).toBe(-2);
    expect(result.warnings).toBeUndefined();
  });

  it("computes the efficiency analysis when pace and HR exist on both sides", () => {
    const result = buildComparison(fakeActivity({}), faster);

    expect(result.efficiency).not.toBeNull();
    // Faster pace at only slightly higher HR → efficiency improved.
    expect(result.efficiency?.change_percent).toBeLessThan(-3);
    expect(result.efficiency?.interpretation).toBe("improved");
  });

  it("skips pace, HR, and efficiency when the data is missing", () => {
    const bare = fakeActivity({
      average_speed: undefined,
      average_heartrate: undefined,
      average_cadence: undefined,
    });
    const result = buildComparison(bare, faster);

    expect(result.activity_1.pace).toBeNull();
    expect(result.differences.pace).toBeNull();
    expect(result.differences.avg_hr).toBeNull();
    expect(result.differences.cadence_spm).toBeNull();
    expect(result.efficiency).toBeNull();
  });

  it("warns when an activity is not a run", () => {
    const ride = fakeActivity({ name: "Commute", type: "Ride" });
    const result = buildComparison(ride, faster);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("Commute");
  });

  it("matches the compare-activities structured output schema", () => {
    const result = buildComparison(fakeActivity({}), faster);
    expect(CompareActivitiesOutputSchema.safeParse(result).success).toBe(true);
  });
});
