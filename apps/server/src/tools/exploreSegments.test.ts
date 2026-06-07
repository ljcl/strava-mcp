import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detailedAthlete } from "../__fixtures__";
import {
  exploreSegments as fetchExploreSegments,
  getAuthenticatedAthlete,
  type StravaAthlete,
  type StravaExplorerResponse,
} from "../stravaClient";
import { exploreSegments } from "./exploreSegments";

vi.mock("../stravaClient", () => ({
  exploreSegments: vi.fn(),
  getAuthenticatedAthlete: vi.fn(),
}));

const mockedExplore = vi.mocked(fetchExploreSegments);
const mockedAthlete = vi.mocked(getAuthenticatedAthlete);

const bounds = "51.25,-0.32,51.27,-0.30";

const explorerSegment = {
  id: 12345,
  name: "Box Hill Climb",
  climb_category: 3,
  climb_category_desc: "3",
  avg_grade: 5.5,
  start_latlng: [51.25, -0.32],
  end_latlng: [51.27, -0.3],
  elev_difference: 124,
  distance: 2500,
  points: "abc",
  starred: true,
};

const explorerResponse = (segments: unknown[]): StravaExplorerResponse =>
  ({ segments }) as StravaExplorerResponse;

const athlete = (pref: "meters" | "feet"): StravaAthlete =>
  ({
    ...detailedAthlete,
    measurement_preference: pref,
  }) as unknown as StravaAthlete;

describe("exploreSegments.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedExplore.mockReset();
    mockedAthlete.mockReset();
    mockedAthlete.mockResolvedValue(athlete("meters"));
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await exploreSegments.execute({ bounds });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("STRAVA_ACCESS_TOKEN is missing");
    expect(mockedExplore).not.toHaveBeenCalled();
  });

  it("rejects climb-category filters without riding activityType", async () => {
    const result = await exploreSegments.execute({
      bounds,
      minCat: 1,
      activityType: "running",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "require activityType to be 'riding'",
    );
    expect(mockedExplore).not.toHaveBeenCalled();
  });

  it("passes bounds and filters through to the client", async () => {
    mockedExplore.mockResolvedValueOnce(explorerResponse([explorerSegment]));

    await exploreSegments.execute({
      bounds,
      activityType: "riding",
      minCat: 1,
      maxCat: 5,
    });

    expect(mockedExplore).toHaveBeenCalledWith(
      "test-token",
      bounds,
      "riding",
      1,
      5,
    );
  });

  it("formats segments in metric units for meters preference", async () => {
    mockedExplore.mockResolvedValueOnce(explorerResponse([explorerSegment]));

    const result = await exploreSegments.execute({ bounds });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Box Hill Climb");
    expect(text).toContain("2.50 km"); // 2500 m
    expect(text).toContain("124 m"); // elev difference
    expect(text).toContain("Avg Grade: 5.5%");
    expect(text).toContain("Starred: Yes");
  });

  it("formats segments in imperial units for feet preference", async () => {
    mockedAthlete.mockResolvedValue(athlete("feet"));
    mockedExplore.mockResolvedValueOnce(explorerResponse([explorerSegment]));

    const result = await exploreSegments.execute({ bounds });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1.55 mi"); // 2500 m -> miles
    expect(text).toContain("407 ft"); // 124 m -> feet
  });

  it("returns a friendly message when no segments are found", async () => {
    mockedExplore.mockResolvedValueOnce(explorerResponse([]));

    const result = await exploreSegments.execute({ bounds });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No segments found");
  });

  it("surfaces API errors", async () => {
    mockedExplore.mockRejectedValueOnce(new Error("upstream 500"));

    const result = await exploreSegments.execute({ bounds });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("API Error: upstream 500");
  });
});
