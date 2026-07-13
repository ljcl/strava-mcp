import { describe, expect, it } from "vitest";
import {
  buildCreateActivityBody,
  buildUpdateActivityBody,
  composeDescription,
} from "./activityWrite";

describe("composeDescription", () => {
  it("replaces when mode is replace", () => {
    expect(composeDescription("old notes", "new", "replace")).toBe("new");
  });

  it("appends with a blank-line separator", () => {
    expect(composeDescription("old notes", "new", "append")).toBe(
      "old notes\n\nnew",
    );
  });

  it("returns incoming alone when existing is null", () => {
    expect(composeDescription(null, "new", "append")).toBe("new");
  });

  it("returns incoming alone when existing is whitespace only", () => {
    expect(composeDescription("   ", "new", "append")).toBe("new");
  });
});

describe("buildUpdateActivityBody", () => {
  it("maps provided fields to snake_case", () => {
    const body = buildUpdateActivityBody({
      name: "Run",
      description: "desc",
      sportType: "TrailRun",
      gearId: "g1",
      commute: true,
      trainer: false,
      hideFromHome: true,
    });
    expect(body).toEqual({
      name: "Run",
      description: "desc",
      sport_type: "TrailRun",
      gear_id: "g1",
      commute: true,
      trainer: false,
      hide_from_home: true,
    });
  });

  it("omits fields that are undefined", () => {
    expect(buildUpdateActivityBody({ name: "Run" })).toEqual({ name: "Run" });
  });

  it("keeps explicit false values", () => {
    expect(buildUpdateActivityBody({ commute: false })).toEqual({
      commute: false,
    });
  });
});

describe("buildCreateActivityBody", () => {
  const required = {
    name: "Morning Yoga",
    sportType: "Yoga",
    startDateLocal: "2026-07-13T07:30:00",
    elapsedTimeSeconds: 1800,
  };

  it("maps required fields to snake_case and omits absent optionals", () => {
    expect(buildCreateActivityBody(required)).toEqual({
      name: "Morning Yoga",
      sport_type: "Yoga",
      start_date_local: "2026-07-13T07:30:00",
      elapsed_time: 1800,
    });
  });

  it("maps optional fields, converting flags to Strava's 1/0 integers", () => {
    expect(
      buildCreateActivityBody({
        ...required,
        distanceMeters: 5000,
        description: "Easy effort",
        trainer: true,
        commute: false,
      }),
    ).toEqual({
      name: "Morning Yoga",
      sport_type: "Yoga",
      start_date_local: "2026-07-13T07:30:00",
      elapsed_time: 1800,
      distance: 5000,
      description: "Easy effort",
      trainer: 1,
      commute: 0,
    });
  });
});
