import { describe, expect, it } from "vitest";
import {
  buildSegmentProgress,
  type SegmentEffortInput,
  type SegmentProgressEffort,
  summarizeSegmentProgress,
} from "./segmentProgress";
import { type StravaDetailedSegment } from "./stravaClient";

/**
 * Minimal detailed segment. Only the fields the mapper reads matter, so we
 * cast through unknown rather than constructing every schema field.
 */
function fakeSegment(
  overrides: Partial<StravaDetailedSegment> = {},
): StravaDetailedSegment {
  return {
    id: "55",
    name: "Heartbreak Hill",
    activity_type: "Run",
    distance: 800,
    average_grade: 5.4,
    maximum_grade: 11.2,
    total_elevation_gain: 43,
    climb_category: 3,
    city: "Sydney",
    state: "NSW",
    country: "Australia",
    starred: true,
    ...overrides,
  } as unknown as StravaDetailedSegment;
}

/** A segment effort with sensible defaults, overridable per test. */
function effort(
  overrides: Partial<SegmentEffortInput> = {},
): SegmentEffortInput {
  return {
    id: "1",
    activity: { id: "900" },
    start_date_local: "2026-01-05T07:00:00Z",
    elapsed_time: 240,
    moving_time: 238,
    distance: 800,
    ...overrides,
  };
}

/** Effort rows for summary tests, oldest-first as the mapper emits them. */
function rows(
  specs: Array<{ date: string; seconds: number; hr?: number | null }>,
): SegmentProgressEffort[] {
  return specs.map((spec, index) => ({
    id: String(index + 1),
    activityId: null,
    date: spec.date,
    elapsedSeconds: spec.seconds,
    movingSeconds: spec.seconds,
    distanceMeters: 800,
    paceSecondsPerKm: null,
    averageHeartrate: spec.hr ?? null,
    maxHeartrate: null,
    averageWatts: null,
    deviceWatts: false,
    averageCadence: null,
    prRank: null,
    komRank: null,
    rank: index + 1,
  }));
}

describe("buildSegmentProgress", () => {
  it("maps segment metadata for the app header", () => {
    const data = buildSegmentProgress(fakeSegment(), []);

    expect(data.segment).toEqual({
      id: "55",
      name: "Heartbreak Hill",
      activityType: "Run",
      distanceMeters: 800,
      averageGrade: 5.4,
      maximumGrade: 11.2,
      elevationGain: 43,
      climbCategory: 3,
      city: "Sydney",
      state: "NSW",
      country: "Australia",
      starred: true,
    });
    expect(data.efforts).toEqual([]);
    expect(data.summary.effortCount).toBe(0);
  });

  it("defaults absent optional segment fields to null rather than dropping them", () => {
    const data = buildSegmentProgress(
      fakeSegment({
        total_elevation_gain: null,
        climb_category: null,
        city: null,
        state: null,
        country: null,
        starred: undefined,
      }),
      [],
    );

    expect(data.segment.elevationGain).toBeNull();
    expect(data.segment.climbCategory).toBeNull();
    expect(data.segment.city).toBeNull();
    expect(data.segment.starred).toBe(false);
  });

  it("sorts efforts oldest-first regardless of API order", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({ id: "3", start_date_local: "2026-03-01T07:00:00Z" }),
      effort({ id: "1", start_date_local: "2026-01-01T07:00:00Z" }),
      effort({ id: "2", start_date_local: "2026-02-01T07:00:00Z" }),
    ]);

    expect(data.efforts.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("ranks efforts by elapsed time, fastest first", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({
        id: "1",
        start_date_local: "2026-01-01T07:00:00Z",
        elapsed_time: 250,
      }),
      effort({
        id: "2",
        start_date_local: "2026-02-01T07:00:00Z",
        elapsed_time: 230,
      }),
      effort({
        id: "3",
        start_date_local: "2026-03-01T07:00:00Z",
        elapsed_time: 240,
      }),
    ]);

    expect(data.efforts.map((e) => [e.id, e.rank])).toEqual([
      ["1", 3],
      ["2", 1],
      ["3", 2],
    ]);
  });

  it("breaks rank ties toward the earlier effort", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({
        id: "1",
        start_date_local: "2026-01-01T07:00:00Z",
        elapsed_time: 240,
      }),
      effort({
        id: "2",
        start_date_local: "2026-02-01T07:00:00Z",
        elapsed_time: 240,
      }),
    ]);

    expect(data.efforts.map((e) => e.rank)).toEqual([1, 2]);
  });

  it("derives pace per km from elapsed time and distance", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({ elapsed_time: 240, distance: 800 }),
    ]);

    expect(data.efforts[0]?.paceSecondsPerKm).toBe(300);
  });

  it("leaves pace null when the effort recorded no distance", () => {
    const data = buildSegmentProgress(fakeSegment(), [effort({ distance: 0 })]);

    expect(data.efforts[0]?.paceSecondsPerKm).toBeNull();
  });

  it("doubles cadence on run segments and leaves ride cadence raw", () => {
    const run = buildSegmentProgress(fakeSegment(), [
      effort({ average_cadence: 88 }),
    ]);
    const ride = buildSegmentProgress(fakeSegment({ activity_type: "Ride" }), [
      effort({ average_cadence: 88 }),
    ]);

    expect(run.efforts[0]?.averageCadence).toBe(176);
    expect(ride.efforts[0]?.averageCadence).toBe(88);
  });

  it("passes null metrics through instead of zero-filling them", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({
        average_heartrate: null,
        max_heartrate: null,
        average_watts: null,
        average_cadence: null,
        pr_rank: null,
        kom_rank: null,
      }),
    ]);

    expect(data.efforts[0]).toMatchObject({
      averageHeartrate: null,
      maxHeartrate: null,
      averageWatts: null,
      averageCadence: null,
      prRank: null,
      komRank: null,
      deviceWatts: false,
    });
  });

  it("keeps Strava's own PR and KOM ranks alongside the derived rank", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({
        pr_rank: 1,
        kom_rank: 8,
        device_watts: true,
        average_watts: 310,
      }),
    ]);

    expect(data.efforts[0]).toMatchObject({
      prRank: 1,
      komRank: 8,
      deviceWatts: true,
      averageWatts: 310,
      rank: 1,
    });
  });

  it("carries the parent activity id so the model can open the run", () => {
    const data = buildSegmentProgress(fakeSegment(), [
      effort({ activity: { id: 12345 } }),
      effort({
        id: "2",
        activity: null,
        start_date_local: "2026-02-01T07:00:00Z",
      }),
    ]);

    expect(data.efforts[0]?.activityId).toBe("12345");
    expect(data.efforts[1]?.activityId).toBeNull();
  });
});

describe("summarizeSegmentProgress", () => {
  it("returns an empty summary for no efforts", () => {
    const summary = summarizeSegmentProgress([]);

    expect(summary).toMatchObject({
      effortCount: 0,
      bestSeconds: null,
      latestSeconds: null,
      latestVsBestSeconds: null,
      early: null,
      recent: null,
    });
  });

  it("reports best, latest, and the gap between them", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 250 },
        { date: "2026-02-01T07:00:00Z", seconds: 230 },
        { date: "2026-03-01T07:00:00Z", seconds: 245 },
      ]),
    );

    expect(summary.effortCount).toBe(3);
    expect(summary.bestSeconds).toBe(230);
    expect(summary.bestDate).toBe("2026-02-01T07:00:00Z");
    expect(summary.latestSeconds).toBe(245);
    expect(summary.latestVsBestSeconds).toBe(15);
    expect(summary.medianSeconds).toBe(245);
  });

  it("reports a zero gap when the latest effort is the best", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 250 },
        { date: "2026-02-01T07:00:00Z", seconds: 230 },
      ]),
    );

    expect(summary.latestVsBestSeconds).toBe(0);
  });

  it("averages even effort counts into two halves", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 260, hr: 170 },
        { date: "2026-02-01T07:00:00Z", seconds: 250, hr: 168 },
        { date: "2026-03-01T07:00:00Z", seconds: 250, hr: 161 },
        { date: "2026-04-01T07:00:00Z", seconds: 260, hr: 159 },
      ]),
    );

    expect(summary.early).toMatchObject({
      count: 2,
      avgSeconds: 255,
      avgHeartrate: 169,
    });
    expect(summary.recent).toMatchObject({
      count: 2,
      avgSeconds: 255,
      avgHeartrate: 160,
    });
    // The headline case from #184: same segment time, materially lower HR.
    expect(summary.avgSecondsDelta).toBe(0);
    expect(summary.avgHeartrateDelta).toBe(-9);
  });

  it("drops the middle effort so odd counts split evenly", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 260 },
        { date: "2026-02-01T07:00:00Z", seconds: 250 },
        { date: "2026-03-01T07:00:00Z", seconds: 999 },
        { date: "2026-04-01T07:00:00Z", seconds: 240 },
        { date: "2026-05-01T07:00:00Z", seconds: 230 },
      ]),
    );

    expect(summary.early).toMatchObject({ count: 2, avgSeconds: 255 });
    expect(summary.recent).toMatchObject({ count: 2, avgSeconds: 235 });
    expect(summary.avgSecondsDelta).toBe(-20);
  });

  it("leaves the halves null below four efforts", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 260 },
        { date: "2026-02-01T07:00:00Z", seconds: 250 },
        { date: "2026-03-01T07:00:00Z", seconds: 240 },
      ]),
    );

    expect(summary.early).toBeNull();
    expect(summary.recent).toBeNull();
    expect(summary.avgSecondsDelta).toBeNull();
    expect(summary.avgHeartrateDelta).toBeNull();
  });

  it("averages heart rate over only the efforts that recorded it", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 260, hr: 170 },
        { date: "2026-02-01T07:00:00Z", seconds: 250, hr: null },
        { date: "2026-03-01T07:00:00Z", seconds: 250, hr: 160 },
        { date: "2026-04-01T07:00:00Z", seconds: 260, hr: null },
      ]),
    );

    expect(summary.heartrateEffortCount).toBe(2);
    expect(summary.early?.avgHeartrate).toBe(170);
    expect(summary.recent?.avgHeartrate).toBe(160);
    expect(summary.avgHeartrateDelta).toBe(-10);
  });

  it("leaves the heart-rate delta null when a half recorded none", () => {
    const summary = summarizeSegmentProgress(
      rows([
        { date: "2026-01-01T07:00:00Z", seconds: 260 },
        { date: "2026-02-01T07:00:00Z", seconds: 250 },
        { date: "2026-03-01T07:00:00Z", seconds: 250, hr: 160 },
        { date: "2026-04-01T07:00:00Z", seconds: 260, hr: 158 },
      ]),
    );

    expect(summary.early?.avgHeartrate).toBeNull();
    expect(summary.recent?.avgHeartrate).toBe(159);
    expect(summary.avgHeartrateDelta).toBeNull();
    expect(summary.avgSecondsDelta).toBe(0);
  });
});
