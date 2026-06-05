import { describe, expect, it } from "vitest";
import * as fixtures from "../__fixtures__";
import { DetailedAthleteSchema } from "../stravaClient";
import { projectAthleteGear } from "./gear";

// The raw fixtures carry numeric ids (as the Strava API sends them); parse them
// so projectAthleteGear receives the normalised shape it gets in production.
const parseAthlete = (raw: unknown) => DetailedAthleteSchema.parse(raw);

describe("projectAthleteGear", () => {
  it("projects shoes and bikes into a flat typed list", () => {
    const gear = projectAthleteGear(parseAthlete(fixtures.detailedAthlete));
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
    expect(projectAthleteGear(parseAthlete(fixtures.athleteNoGear))).toEqual(
      [],
    );
  });

  it("normalizes missing nickname and retired to null/false", () => {
    const gear = projectAthleteGear(parseAthlete(fixtures.detailedAthlete));
    const bike = gear.find((g) => g.id === "b111222");
    expect(bike?.nickname).toBeNull();
    expect(bike?.retired).toBe(false);
  });
});
