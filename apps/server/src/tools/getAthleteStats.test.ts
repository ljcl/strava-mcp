import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledNotFound, handledRateLimit } from "../__fixtures__";
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
    mockedStats.mockReset();
    mockedAthlete.mockReset();
  });

  it("resolves the authenticated athlete when athleteId is omitted", async () => {
    mockedAthlete.mockResolvedValue({ id: "7777" } as Awaited<
      ReturnType<typeof getAuthenticatedAthleteClient>
    >);
    mockedStats.mockResolvedValue(stats);

    const result = await getAthleteStatsTool.execute({}, "test-token");

    expect(result.isError).toBeUndefined();
    expect(mockedAthlete).toHaveBeenCalledWith("test-token");
    // The client normalises athlete ids to strings; the tool passes the id
    // through untouched so oversized ids stay exact.
    expect(mockedStats).toHaveBeenCalledWith("test-token", "7777");
    expect(result.content[0]?.text).toContain("Your Strava Stats");
  });

  it("uses an explicit athleteId without resolving the authenticated athlete", async () => {
    mockedStats.mockResolvedValue(stats);

    const result = await getAthleteStatsTool.execute(
      { athleteId: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(mockedAthlete).not.toHaveBeenCalled();
    expect(mockedStats).toHaveBeenCalledWith("test-token", "12345");
    expect(result.structuredContent).toBeDefined();
  });

  it("maps a not-found error for an explicit athleteId to a friendly message", async () => {
    mockedStats.mockRejectedValue(handledNotFound("getAthleteStats"));

    const result = await getAthleteStatsTool.execute(
      { athleteId: "42" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "❌ Athlete with ID 42 not found (when fetching stats).",
    );
  });

  it("reports the authenticated athlete in error messages when id was omitted", async () => {
    mockedAthlete.mockRejectedValue(new Error("network down"));

    const result = await getAthleteStatsTool.execute({}, "test-token");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "❌ Failed to fetch stats for the authenticated athlete: network down",
    );
  });

  it("renders the rate-limit window on a RateLimitError", async () => {
    mockedStats.mockRejectedValue(handledRateLimit("getAthleteStats"));

    const result = await getAthleteStatsTool.execute(
      { athleteId: "42" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.startsWith("❌")).toBe(true);
    expect(text).toContain("rate limit");
    expect(text).toContain("15-minute rate limit reached (100/100 requests).");
  });
});
