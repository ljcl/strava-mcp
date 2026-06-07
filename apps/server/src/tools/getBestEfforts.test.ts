import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityWithBestEfforts,
  basicRunActivity,
  rideActivity,
} from "../__fixtures__";
import {
  getActivityById,
  getAllActivities,
  type StravaDetailedActivity,
  type StravaSummaryActivity,
} from "../stravaClient";
import { getBestEffortsTool } from "./getBestEfforts";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
  getActivityById: vi.fn(),
}));

const mockedList = vi.mocked(getAllActivities);
const mockedById = vi.mocked(getActivityById);

const asSummary = (a: unknown) => a as unknown as StravaSummaryActivity;
const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

describe("getBestEffortsTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedList.mockReset();
    mockedById.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getBestEffortsTool.execute({
      limit: 3,
      maxActivities: 100,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("caps perPage at 200 when scanning", async () => {
    mockedList.mockResolvedValueOnce([]);

    await getBestEffortsTool.execute({ limit: 3, maxActivities: 1000 });

    expect(mockedList).toHaveBeenCalledWith("test-token", { perPage: 200 });
  });

  it("only fetches details for running activities", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary(basicRunActivity),
      asSummary(rideActivity),
    ]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    await getBestEffortsTool.execute({ limit: 3, maxActivities: 100 });

    // Ride is filtered out; only the run triggers a detail fetch.
    expect(mockedById).toHaveBeenCalledTimes(1);
    expect(mockedById).toHaveBeenCalledWith("test-token", basicRunActivity.id);
  });

  it("aggregates best efforts and surfaces a PR medal", async () => {
    mockedList.mockResolvedValueOnce([asSummary(activityWithBestEfforts)]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute({
      limit: 3,
      maxActivities: 100,
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Best Efforts Summary");
    expect(text).toContain("400m");
    expect(text).toContain("1:30"); // 90s formatted
    expect(text).toContain("🥇 PR"); // pr_rank 1 on the 400m
    expect(result.structuredContent?.activities_analyzed).toBe(1);
    expect(result.structuredContent?.activities_with_efforts).toBe(1);
  });

  it("sorts multiple efforts per distance by elapsed time and applies limit", async () => {
    const fast = {
      ...activityWithBestEfforts,
      id: 1,
      name: "Fast 400",
      best_efforts: [
        { ...activityWithBestEfforts.best_efforts[0], elapsed_time: 80 },
      ],
    };
    const slow = {
      ...activityWithBestEfforts,
      id: 2,
      name: "Slow 400",
      best_efforts: [
        {
          ...activityWithBestEfforts.best_efforts[0],
          elapsed_time: 100,
          pr_rank: null,
        },
      ],
    };
    mockedList.mockResolvedValueOnce([asSummary(fast), asSummary(slow)]);
    mockedById
      .mockResolvedValueOnce(asDetail(fast))
      .mockResolvedValueOnce(asDetail(slow));

    const result = await getBestEffortsTool.execute({
      limit: 1,
      maxActivities: 100,
    });

    const efforts = result.structuredContent?.best_efforts?.["400m"];
    expect(efforts).toHaveLength(1); // limit applied
    expect(efforts?.[0]?.elapsed_time_seconds).toBe(80); // fastest first
  });

  it("filters to a single distance when requested", async () => {
    mockedList.mockResolvedValueOnce([asSummary(activityWithBestEfforts)]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute({
      distance: "400m",
      limit: 3,
      maxActivities: 100,
    });

    const efforts = result.structuredContent?.best_efforts;
    expect(Object.keys(efforts ?? {})).toEqual(["400m"]);
  });

  it("reports when no efforts are found", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(asDetail({ ...basicRunActivity }));

    const result = await getBestEffortsTool.execute({
      limit: 3,
      maxActivities: 100,
    });

    expect(result.content[0]?.text).toContain("No best efforts found");
  });

  it("skips activities that fail to fetch", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary({ ...basicRunActivity, id: 1 }),
      asSummary(activityWithBestEfforts),
    ]);
    mockedById
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute({
      limit: 3,
      maxActivities: 100,
    });

    // One failed fetch is skipped; the other still contributes efforts.
    expect(result.structuredContent?.activities_with_efforts).toBe(1);
    expect(result.content[0]?.text).toContain("400m");
  });

  it("returns an error result when the listing call throws", async () => {
    mockedList.mockRejectedValueOnce(new Error("network down"));

    const result = await getBestEffortsTool.execute({
      limit: 3,
      maxActivities: 100,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("network down");
  });
});
