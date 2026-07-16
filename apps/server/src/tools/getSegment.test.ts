import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSegmentById as fetchSegmentById,
  type StravaDetailedSegment,
} from "../stravaClient";
import { getSegmentTool } from "./getSegment";

vi.mock("../stravaClient", () => ({
  getSegmentById: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchSegmentById);

const segment = {
  id: 789,
  name: "Box Hill Climb",
  activity_type: "Ride",
  city: "Dorking",
  state: "Surrey",
  country: "United Kingdom",
  distance: 2500,
  average_grade: 4.9,
  maximum_grade: 11.2,
  total_elevation_gain: 120,
  elevation_high: 224,
  elevation_low: 104,
  climb_category: 3,
  private: false,
  starred: true,
  effort_count: 100000,
  athlete_count: 25000,
  star_count: 4000,
  created_at: "2009-06-01T00:00:00Z",
} as unknown as StravaDetailedSegment;

describe("get-segment execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("formats the segment details", async () => {
    mockedFetch.mockResolvedValueOnce(segment);

    const result = await getSegmentTool.execute({ segmentId: "789" });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", "789");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Box Hill Climb");
    expect(text).toContain("2.50 km");
    expect(text).toContain("Avg Grade: 4.9%");
    expect(text).toContain("Dorking, Surrey, United Kingdom");
    expect(text).toContain("Starred by You: Yes");
  });

  it("maps a 404 to a segment-not-found message", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("404 Not Found"));

    const result = await getSegmentTool.execute({ segmentId: "789" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Segment with ID 789 not found");
  });

  it("reports other failures with details", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Bad Gateway"));

    const result = await getSegmentTool.execute({ segmentId: "789" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Bad Gateway");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getSegmentTool.execute({ segmentId: "789" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
