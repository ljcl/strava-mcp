import { describe, expect, it } from "vitest";
import * as fixtures from "./__fixtures__";
import {
  ActivityStatsSchema,
  DetailedActivitySchema,
  DetailedAthleteSchema,
  DetailedSegmentSchema,
  RouteSchema,
  SummarySegmentSchema,
} from "./stravaClient";

describe("DetailedActivitySchema", () => {
  it("parses a basic run activity", () => {
    const result = DetailedActivitySchema.safeParse(fixtures.basicRunActivity);
    expect(result.success).toBe(true);
  });

  it("parses activity with null optional fields", () => {
    const result = DetailedActivitySchema.safeParse(
      fixtures.activityWithNullOptionals,
    );
    expect(result.success).toBe(true);
  });

  it("parses virtual run activity", () => {
    const result = DetailedActivitySchema.safeParse(
      fixtures.virtualRunActivity,
    );
    expect(result.success).toBe(true);
  });

  it("parses ride activity with power data", () => {
    const result = DetailedActivitySchema.safeParse(fixtures.rideActivity);
    expect(result.success).toBe(true);
  });

  it("parses activity with best efforts", () => {
    const result = DetailedActivitySchema.safeParse(
      fixtures.activityWithBestEfforts,
    );
    expect(result.success).toBe(true);
  });

  it("rejects activity missing required fields", () => {
    const { id, ...incomplete } = fixtures.basicRunActivity;
    const result = DetailedActivitySchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe("ActivityStatsSchema", () => {
  it("parses complete activity stats", () => {
    const result = ActivityStatsSchema.safeParse(fixtures.activityStats);
    expect(result.success).toBe(true);
  });

  it("parses activity stats with null optionals", () => {
    const result = ActivityStatsSchema.safeParse(
      fixtures.activityStatsWithNulls,
    );
    expect(result.success).toBe(true);
  });
});

describe("DetailedAthleteSchema", () => {
  it("parses detailed athlete", () => {
    const result = DetailedAthleteSchema.safeParse(fixtures.detailedAthlete);
    expect(result.success).toBe(true);
  });

  it("parses athlete with null fields", () => {
    const result = DetailedAthleteSchema.safeParse(
      fixtures.athleteWithNullFields,
    );
    expect(result.success).toBe(true);
  });
});

describe("SummarySegmentSchema", () => {
  it("parses summary segment", () => {
    const result = SummarySegmentSchema.safeParse(fixtures.summarySegment);
    expect(result.success).toBe(true);
  });

  it("parses segment with null optionals", () => {
    const result = SummarySegmentSchema.safeParse(
      fixtures.segmentWithNullOptionals,
    );
    expect(result.success).toBe(true);
  });
});

describe("DetailedSegmentSchema", () => {
  it("parses detailed segment", () => {
    const result = DetailedSegmentSchema.safeParse(fixtures.detailedSegment);
    expect(result.success).toBe(true);
  });
});

describe("RouteSchema", () => {
  it("parses basic route", () => {
    const result = RouteSchema.safeParse(fixtures.basicRoute);
    expect(result.success).toBe(true);
  });

  it("parses route with null optionals", () => {
    const result = RouteSchema.safeParse(fixtures.routeWithNullOptionals);
    expect(result.success).toBe(true);
  });

  it("parses running route", () => {
    const result = RouteSchema.safeParse(fixtures.runningRoute);
    expect(result.success).toBe(true);
  });
});
