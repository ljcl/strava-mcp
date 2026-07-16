import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAthleteRoutes as fetchAthleteRoutes,
  type StravaRoute,
} from "../stravaClient";
import { listAthleteRoutesTool } from "./listAthleteRoutes";

vi.mock("../stravaClient", () => ({
  listAthleteRoutes: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAthleteRoutes);

const route = {
  id: "42",
  name: "River Loop",
  type: 2,
  distance: 12500,
  elevation_gain: 180,
  created_at: "2026-01-15T10:00:00Z",
} as unknown as StravaRoute;

describe("list-athlete-routes execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("lists routes with pagination args passed through", async () => {
    mockedFetch.mockResolvedValueOnce([route]);

    const result = await listAthleteRoutesTool.execute({ page: 2, perPage: 5 });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", 2, 5);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Athlete Routes (Page 2)");
    expect(text).toContain("River Loop");
    expect(text).toContain("12.5 km");
    expect(text).toContain("Type: Run");
  });

  it("reports no routes without an error flag", async () => {
    mockedFetch.mockResolvedValueOnce([]);

    const result = await listAthleteRoutesTool.execute({
      page: 1,
      perPage: 20,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No routes found");
  });

  it("returns isError when the fetch fails", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Server error"));

    const result = await listAthleteRoutesTool.execute({
      page: 1,
      perPage: 20,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Server error");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await listAthleteRoutesTool.execute({
      page: 1,
      perPage: 20,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Configuration Error");
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
