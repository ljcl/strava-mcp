import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledNotFound, handledRateLimit } from "../__fixtures__";
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
    mockedFetch.mockReset();
  });

  it("formats the segment details", async () => {
    mockedFetch.mockResolvedValueOnce(segment);

    const result = await getSegmentTool.execute(
      { segmentId: "789" },
      "test-token",
    );

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
    mockedFetch.mockRejectedValueOnce(handledNotFound("getSegmentById"));

    const result = await getSegmentTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("❌ Segment with ID 789 not found.");
  });

  it("renders the rate-limit window on a RateLimitError", async () => {
    mockedFetch.mockRejectedValueOnce(handledRateLimit("getSegmentById"));

    const result = await getSegmentTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.startsWith("❌")).toBe(true);
    expect(text).toContain("rate limit");
    expect(text).toContain("15-minute rate limit reached (100/100 requests).");
  });

  it("reports other failures with details", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Bad Gateway"));

    const result = await getSegmentTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Bad Gateway");
  });
});
