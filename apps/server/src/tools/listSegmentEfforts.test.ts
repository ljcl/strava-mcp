import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSegmentEfforts as fetchSegmentEfforts,
  type StravaDetailedSegmentEffort,
} from "../stravaClient";
import { listSegmentEffortsTool } from "./listSegmentEfforts";

vi.mock("../stravaClient", () => ({
  listSegmentEfforts: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchSegmentEfforts);

const effort = {
  id: "555",
  start_date_local: "2026-06-01T08:00:00Z",
  moving_time: 300,
  elapsed_time: 310,
  distance: 2500,
  pr_rank: 1,
  kom_rank: null,
} as unknown as StravaDetailedSegmentEffort;

describe("list-segment-efforts execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("lists efforts and forwards the date filters", async () => {
    mockedFetch.mockResolvedValueOnce([effort]);

    const result = await listSegmentEffortsTool.execute({
      segmentId: "789",
      startDateLocal: "2026-06-01T00:00:00Z",
      endDateLocal: "2026-06-30T00:00:00Z",
      perPage: 10,
    });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", "789", {
      startDateLocal: "2026-06-01T00:00:00Z",
      endDateLocal: "2026-06-30T00:00:00Z",
      perPage: 10,
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Segment 789 Efforts");
    expect(text).toContain("Effort ID: 555");
    expect(text).toContain("PR Rank: 1");
  });

  it("reports no efforts without an error flag", async () => {
    mockedFetch.mockResolvedValueOnce([]);

    const result = await listSegmentEffortsTool.execute({
      segmentId: "789",
      perPage: 30,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No efforts found");
  });

  it("maps SUBSCRIPTION_REQUIRED to the subscription message", async () => {
    mockedFetch.mockRejectedValueOnce(
      new Error("SUBSCRIPTION_REQUIRED: payment needed"),
    );

    const result = await listSegmentEffortsTool.execute({
      segmentId: "789",
      perPage: 30,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires a Strava subscription");
  });

  it("maps a 404 to a segment-not-found message", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await listSegmentEffortsTool.execute({
      segmentId: "789",
      perPage: 30,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Segment with ID 789 not found");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await listSegmentEffortsTool.execute({
      segmentId: "789",
      perPage: 30,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
