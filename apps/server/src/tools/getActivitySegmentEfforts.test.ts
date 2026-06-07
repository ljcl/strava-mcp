import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityWithSegmentEfforts, basicRunActivity } from "../__fixtures__";
import {
  getActivityById as fetchActivityById,
  type StravaDetailedActivity,
} from "../stravaClient";
import { getActivitySegmentEffortsTool } from "./getActivitySegmentEfforts";

vi.mock("../stravaClient", () => ({
  getActivityById: vi.fn(),
}));

const mockedById = vi.mocked(fetchActivityById);

const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

describe("getActivitySegmentEffortsTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedById.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
  });

  it("reports when an activity has no segment efforts", async () => {
    mockedById.mockResolvedValueOnce(asDetail(basicRunActivity));

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 12345678,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "No segment efforts recorded for activity 12345678",
    );
  });

  it("summarizes PR and top-10 counts and orders achievements first", async () => {
    mockedById.mockResolvedValueOnce(asDetail(activityWithSegmentEfforts));

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 12345683,
    });

    const text = result.content[0]?.text ?? "";
    // 3 efforts: Riverside is a PR (pr_rank 1) + top-10; Bridge is 2nd best
    // (pr_rank 2, not counted as a PR); Park Loop is unranked.
    expect(text).toContain("3 efforts, 1 PR, 1 top-10");
    expect(text).toContain("Riverside Sprint");
    expect(text).toContain("PR, Top 10 (#8)");
    expect(text).toContain("2nd best");

    // PR effort sorts ahead of the unranked Park Loop effort.
    const lines = text.split("\n");
    const riversideIdx = lines.findIndex((l) => l.includes("Riverside Sprint"));
    const parkIdx = lines.findIndex((l) => l.includes("Park Loop"));
    expect(riversideIdx).toBeLessThan(parkIdx);
  });

  it("formats elapsed time and distance per effort", async () => {
    mockedById.mockResolvedValueOnce(asDetail(activityWithSegmentEfforts));

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 12345683,
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1:15 over 0.40 km"); // Riverside: 75s, 400m
  });

  it("maps a not-found error to a friendly message", async () => {
    mockedById.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 42,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Activity with ID 42 not found");
  });

  it("surfaces other fetch errors with the activity id", async () => {
    mockedById.mockRejectedValueOnce(new Error("timeout"));

    const result = await getActivitySegmentEffortsTool.execute({
      activityId: 7,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Failed to fetch segment efforts for activity 7: timeout",
    );
  });
});
