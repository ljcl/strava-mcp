import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAthleteStats as getAthleteStatsClient,
  getAuthenticatedAthlete as getAuthenticatedAthleteClient,
  type StravaStats,
} from "../stravaClient";
import { getAthleteStatsTool } from "./getAthleteStats";

vi.mock("../stravaClient", () => ({
  getAthleteStats: vi.fn(),
  getAuthenticatedAthlete: vi.fn(),
}));

const mockedStats = vi.mocked(getAthleteStatsClient);
const mockedAthlete = vi.mocked(getAuthenticatedAthleteClient);

const emptyTotals = {
  count: 0,
  distance: 0,
  moving_time: 0,
  elapsed_time: 0,
  elevation_gain: 0,
};

const stats: StravaStats = {
  recent_ride_totals: emptyTotals,
  recent_swim_totals: emptyTotals,
  ytd_ride_totals: emptyTotals,
  ytd_swim_totals: emptyTotals,
  all_ride_totals: emptyTotals,
  all_swim_totals: emptyTotals,
  recent_run_totals: {
    count: 5,
    distance: 42000,
    moving_time: 14400,
    elapsed_time: 15000,
    elevation_gain: 300,
  },
  ytd_run_totals: {
    count: 50,
    distance: 420000,
    moving_time: 144000,
    elapsed_time: 150000,
    elevation_gain: 3000,
  },
  all_run_totals: {
    count: 200,
    distance: 1680000,
    moving_time: 576000,
    elapsed_time: 600000,
    elevation_gain: 12000,
  },
};

describe("getAthleteStatsTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedStats.mockReset();
    mockedAthlete.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("resolves the authenticated athlete when athleteId is omitted", async () => {
    mockedAthlete.mockResolvedValue({ id: "7777" } as Awaited<
      ReturnType<typeof getAuthenticatedAthleteClient>
    >);
    mockedStats.mockResolvedValue(stats);

    const result = await getAthleteStatsTool.execute({});

    expect(result.isError).toBeUndefined();
    expect(mockedAthlete).toHaveBeenCalledWith("test-token");
    expect(mockedStats).toHaveBeenCalledWith("test-token", 7777);
    expect(result.content[0]?.text).toContain("Your Strava Stats");
  });

  it("uses an explicit athleteId without resolving the authenticated athlete", async () => {
    mockedStats.mockResolvedValue(stats);

    const result = await getAthleteStatsTool.execute({ athleteId: 12345 });

    expect(result.isError).toBeUndefined();
    expect(mockedAthlete).not.toHaveBeenCalled();
    expect(mockedStats).toHaveBeenCalledWith("test-token", 12345);
    expect(result.structuredContent).toBeDefined();
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getAthleteStatsTool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
  });

  it("maps a not-found error for an explicit athleteId to a friendly message", async () => {
    mockedStats.mockRejectedValue(new Error("Record Not Found"));

    const result = await getAthleteStatsTool.execute({ athleteId: 42 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Athlete with ID 42 not found");
  });

  it("reports the authenticated athlete in error messages when id was omitted", async () => {
    mockedAthlete.mockRejectedValue(new Error("network down"));

    const result = await getAthleteStatsTool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("the authenticated athlete");
  });
});
