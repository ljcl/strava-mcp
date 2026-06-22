import { describe, expect, it } from "vitest";
import { mapActivitySegments } from "./activitySegments";
import { type StravaDetailedActivity } from "./stravaClient";

/**
 * Build a minimal detailed activity from a partial. Only the fields the mapper
 * reads matter; we cast through unknown so tests stay terse rather than
 * constructing every required schema field.
 */
function fakeActivity(
  overrides: Omit<Partial<StravaDetailedActivity>, "segment_efforts"> & {
    segment_efforts?: unknown[];
  },
): StravaDetailedActivity {
  return {
    id: "100",
    name: "Morning Run",
    type: "Run",
    sport_type: "Run",
    start_date_local: "2026-06-01T07:00:00Z",
    ...overrides,
  } as unknown as StravaDetailedActivity;
}

/** A segment effort with sensible defaults, overridable per test. */
function effort(overrides: Record<string, unknown>): unknown {
  return {
    name: "Hill",
    segment: {
      id: "55",
      average_grade: 4.2,
      maximum_grade: 9.1,
      climb_category: 2,
    },
    distance: 500,
    elapsed_time: 120,
    moving_time: 118,
    pr_rank: null,
    kom_rank: null,
    average_heartrate: null,
    max_heartrate: null,
    average_watts: null,
    device_watts: null,
    average_cadence: null,
    start_index: 0,
    ...overrides,
  };
}

describe("mapActivitySegments", () => {
  it("returns empty segments when the activity has no efforts", () => {
    const data = mapActivitySegments(fakeActivity({}));
    expect(data.segments).toEqual([]);
    expect(data.id).toBe("100");
    expect(data.name).toBe("Morning Run");
    expect(data.activityType).toBe("Run");
    expect(data.startDateLocal).toBe("2026-06-01T07:00:00Z");
  });

  it("treats an empty efforts array as empty segments", () => {
    const data = mapActivitySegments(fakeActivity({ segment_efforts: [] }));
    expect(data.segments).toEqual([]);
  });

  it("sorts ascending by start_index and sinks nulls last", () => {
    const data = mapActivitySegments(
      fakeActivity({
        segment_efforts: [
          effort({ name: "third", start_index: 300 }),
          effort({ name: "no-index", start_index: null }),
          effort({ name: "first", start_index: 10 }),
          effort({ name: "second", start_index: 50 }),
        ],
      }),
    );
    expect(data.segments.map((s) => s.name)).toEqual([
      "first",
      "second",
      "third",
      "no-index",
    ]);
    expect(data.segments[3]!.startIndex).toBeNull();
  });

  it("passes null metrics through untouched", () => {
    const data = mapActivitySegments(
      fakeActivity({
        segment_efforts: [
          effort({
            average_heartrate: null,
            max_heartrate: null,
            average_watts: null,
            device_watts: null,
            average_cadence: null,
            pr_rank: null,
            kom_rank: null,
          }),
        ],
      }),
    );
    const row = data.segments[0]!;
    expect(row.averageHeartrate).toBeNull();
    expect(row.maxHeartrate).toBeNull();
    expect(row.averageWatts).toBeNull();
    expect(row.deviceWatts).toBeNull();
    expect(row.averageCadence).toBeNull();
    expect(row.prRank).toBeNull();
    expect(row.komRank).toBeNull();
  });

  it("preserves PR and KOM ranks, grade, climb category, and metrics", () => {
    const data = mapActivitySegments(
      fakeActivity({
        segment_efforts: [
          effort({
            pr_rank: 1,
            kom_rank: 7,
            average_heartrate: 165,
            max_heartrate: 178,
            average_watts: 290,
            device_watts: true,
            average_cadence: 88,
            segment: {
              id: "55",
              average_grade: 4.2,
              maximum_grade: 9.1,
              climb_category: 3,
            },
          }),
        ],
      }),
    );
    const row = data.segments[0]!;
    expect(row.prRank).toBe(1);
    expect(row.komRank).toBe(7);
    expect(row.averageHeartrate).toBe(165);
    expect(row.maxHeartrate).toBe(178);
    expect(row.averageWatts).toBe(290);
    expect(row.deviceWatts).toBe(true);
    expect(row.averageCadence).toBe(88);
    expect(row.averageGrade).toBe(4.2);
    expect(row.maximumGrade).toBe(9.1);
    expect(row.climbCategory).toBe(3);
  });

  it("stringifies the segment id and falls back to empty when missing", () => {
    const data = mapActivitySegments(
      fakeActivity({
        segment_efforts: [
          effort({
            segment: { id: 12345, average_grade: 0, maximum_grade: 0 },
          }),
          effort({ name: "no-segment", segment: undefined, start_index: 1 }),
        ],
      }),
    );
    expect(data.segments[0]!.segmentId).toBe("12345");
    expect(typeof data.segments[0]!.segmentId).toBe("string");
    expect(data.segments[1]!.segmentId).toBe("");
    expect(data.segments[1]!.climbCategory).toBeNull();
  });

  it("falls back to sport_type then null for activityType", () => {
    const withSport = mapActivitySegments(
      fakeActivity({
        type: undefined as unknown as string,
        sport_type: "TrailRun",
      }),
    );
    expect(withSport.activityType).toBe("TrailRun");

    const withNeither = mapActivitySegments(
      fakeActivity({
        type: undefined as unknown as string,
        sport_type: undefined as unknown as string,
      }),
    );
    expect(withNeither.activityType).toBeNull();
  });

  it("defaults missing start_date_local to an empty string", () => {
    const data = mapActivitySegments(
      fakeActivity({ start_date_local: undefined as unknown as string }),
    );
    expect(data.startDateLocal).toBe("");
  });
});
