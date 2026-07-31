/**
 * The sport-type vocabulary both write tools accept (#244). The enum is the
 * server's own copy of a list Strava publishes only as prose, so these cover
 * the shape of the list as well as the schema built from it.
 */
import { describe, expect, it } from "vitest";
import {
  SPORT_TYPES,
  SportTypeSchema,
  suggestSportTypes,
} from "./activityWrite";

describe("SPORT_TYPES", () => {
  it("carries the sports the rest of the server special-cases", () => {
    // Every running type the analysis tools filter on must be creatable.
    for (const type of ["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]) {
      expect(SPORT_TYPES).toContain(type);
    }
    // And the manual-entry sports the create tool exists for.
    for (const type of ["WeightTraining", "Yoga", "Workout", "Swim", "Ride"]) {
      expect(SPORT_TYPES).toContain(type);
    }
  });

  it("has no duplicates and stays PascalCase", () => {
    expect(new Set(SPORT_TYPES).size).toBe(SPORT_TYPES.length);
    for (const type of SPORT_TYPES) {
      expect(type).toMatch(/^[A-Z][A-Za-z]*$/);
    }
  });
});

describe("SportTypeSchema", () => {
  it("accepts every value in the list", () => {
    for (const type of SPORT_TYPES) {
      expect(SportTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects an invalid value with the allowed list in the message", () => {
    const result = SportTypeSchema.safeParse("Jetpacking");
    expect(result.success).toBe(false);
    const message = result.error!.issues[0]!.message;
    expect(message).toContain('"Jetpacking" is not a Strava sport type');
    expect(message).toContain("WeightTraining");
    expect(message).toContain("Yoga");
  });

  it("names the near miss, which is the part a caller can act on", () => {
    const message =
      SportTypeSchema.safeParse("Weightlifting").error!.issues[0]!.message;
    expect(message).toContain("Did you mean WeightTraining?");
  });

  it("rejects a wrongly-cased value but points at the right casing", () => {
    const result = SportTypeSchema.safeParse("run");
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("Did you mean Run");
  });

  it("rejects a non-string without inventing a suggestion", () => {
    const message = SportTypeSchema.safeParse(42).error!.issues[0]!.message;
    expect(message).toContain("A Strava sport type is required.");
    expect(message).not.toContain("Did you mean");
  });
});

describe("suggestSportTypes", () => {
  it("ranks by how much of the value matched", () => {
    expect(suggestSportTypes("Mountain")).toEqual(["MountainBikeRide"]);
    expect(suggestSportTypes("Virtual")).toEqual([
      "VirtualRide",
      "VirtualRow",
      "VirtualRun",
    ]);
  });

  it("caps the list so an error stays readable", () => {
    expect(suggestSportTypes("S", 3).length).toBeLessThanOrEqual(3);
    expect(suggestSportTypes("Sn", 2).length).toBeLessThanOrEqual(2);
  });

  it("suggests nothing for a value with no plausible match", () => {
    expect(suggestSportTypes("Jetpacking")).toEqual([]);
    expect(suggestSportTypes("")).toEqual([]);
  });
});
