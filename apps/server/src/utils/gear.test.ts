import { describe, expect, it } from "vitest";
import * as fixtures from "../__fixtures__";
import { projectAthleteGear } from "./gear";

describe("projectAthleteGear", () => {
  it("projects shoes and bikes into a flat typed list", () => {
    const gear = projectAthleteGear(fixtures.detailedAthlete);
    expect(gear).toHaveLength(3);
    const shoe = gear.find((g) => g.id === "g123456");
    expect(shoe).toEqual({
      id: "g123456",
      type: "shoe",
      name: "Nike Pegasus 40",
      nickname: "Daily trainers",
      distanceMeters: 412000,
      primary: true,
      retired: false,
    });
    const bike = gear.find((g) => g.id === "b111222");
    expect(bike?.type).toBe("bike");
  });

  it("returns an empty array when there is no gear", () => {
    expect(projectAthleteGear(fixtures.athleteNoGear)).toEqual([]);
  });

  it("normalizes missing nickname and retired to null/false", () => {
    const gear = projectAthleteGear(fixtures.detailedAthlete);
    const bike = gear.find((g) => g.id === "b111222");
    expect(bike?.nickname).toBeNull();
    expect(bike?.retired).toBe(false);
  });
});
