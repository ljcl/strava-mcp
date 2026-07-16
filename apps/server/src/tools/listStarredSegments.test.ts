import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listStarredSegments as fetchSegments,
  getAuthenticatedAthlete,
  type StravaAthlete,
  type StravaSegment,
} from "../stravaClient";
import { listStarredSegments } from "./listStarredSegments";

vi.mock("../stravaClient", () => ({
  listStarredSegments: vi.fn(),
  getAuthenticatedAthlete: vi.fn(),
}));

const mockedSegments = vi.mocked(fetchSegments);
const mockedAthlete = vi.mocked(getAuthenticatedAthlete);

const athlete = (measurement: string) =>
  ({ id: 1, measurement_preference: measurement }) as unknown as StravaAthlete;

const segment = {
  id: 789,
  name: "Box Hill Climb",
  activity_type: "Ride",
  distance: 2500,
  average_grade: 4.9,
  city: "Dorking",
  state: "Surrey",
  country: "United Kingdom",
  private: false,
} as unknown as StravaSegment;

describe("list-starred-segments execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedSegments.mockReset();
    mockedAthlete.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("lists starred segments in km for meters preference", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([segment]);

    const result = await listStarredSegments.execute();

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Box Hill Climb");
    expect(text).toContain("2.50 km");
    expect(text).toContain("Dorking, Surrey, United Kingdom");
  });

  it("converts distance to miles for feet preference", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("feet"));
    mockedSegments.mockResolvedValueOnce([segment]);

    const result = await listStarredSegments.execute();

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("1.55 mi");
  });

  it("reports no starred segments without an error flag", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([]);

    const result = await listStarredSegments.execute();

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No starred segments found");
  });

  it("returns isError when the fetch fails", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockRejectedValueOnce(new Error("Server error"));

    const result = await listStarredSegments.execute();

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Server error");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await listStarredSegments.execute();

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Configuration Error");
    expect(mockedSegments).not.toHaveBeenCalled();
  });
});
