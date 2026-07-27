import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityWithBestEfforts,
  basicRunActivity,
  rideActivity,
} from "../__fixtures__";
import { RateLimitError } from "../fetchClient";
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

  it("caps perPage at 200 and bounds pagination to running activities", async () => {
    mockedList.mockResolvedValueOnce([]);

    await getBestEffortsTool.execute(
      { limit: 3, maxActivities: 1000 },
      "test-token",
    );

    expect(mockedList).toHaveBeenCalledWith("test-token", {
      perPage: 200,
      maxItems: 1000,
      countActivity: expect.any(Function),
    });

    // The cap must count runs only, so mixed histories keep paginating
    // until enough running activities have arrived.
    const countActivity = mockedList.mock.calls[0]?.[1]?.countActivity;
    expect(countActivity?.(asSummary(basicRunActivity))).toBe(true);
    expect(countActivity?.(asSummary(rideActivity))).toBe(false);
  });

  it("only fetches details for running activities", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary(basicRunActivity),
      asSummary(rideActivity),
    ]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    await getBestEffortsTool.execute(
      { limit: 3, maxActivities: 100 },
      "test-token",
    );

    // Ride is filtered out; only the run triggers a detail fetch.
    expect(mockedById).toHaveBeenCalledTimes(1);
    expect(mockedById).toHaveBeenCalledWith("test-token", basicRunActivity.id);
  });

  it("aggregates best efforts and surfaces a PR medal", async () => {
    mockedList.mockResolvedValueOnce([asSummary(activityWithBestEfforts)]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute(
      {
        limit: 3,
        maxActivities: 100,
      },
      "test-token",
    );

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

    const result = await getBestEffortsTool.execute(
      {
        limit: 1,
        maxActivities: 100,
      },
      "test-token",
    );

    const efforts = result.structuredContent?.best_efforts?.["400m"];
    expect(efforts).toHaveLength(1); // limit applied
    expect(efforts?.[0]?.elapsed_time_seconds).toBe(80); // fastest first
  });

  it("filters to a single distance when requested", async () => {
    mockedList.mockResolvedValueOnce([asSummary(activityWithBestEfforts)]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute(
      {
        distance: "400m",
        limit: 3,
        maxActivities: 100,
      },
      "test-token",
    );

    const efforts = result.structuredContent?.best_efforts;
    expect(Object.keys(efforts ?? {})).toEqual(["400m"]);
  });

  it("reports when no efforts are found", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(asDetail({ ...basicRunActivity }));

    const result = await getBestEffortsTool.execute(
      {
        limit: 3,
        maxActivities: 100,
      },
      "test-token",
    );

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

    const result = await getBestEffortsTool.execute(
      {
        limit: 3,
        maxActivities: 100,
      },
      "test-token",
    );

    // One failed fetch is skipped; the other still contributes efforts.
    expect(result.structuredContent?.activities_with_efforts).toBe(1);
    expect(result.content[0]?.text).toContain("400m");
    // #239: a skipped activity is now counted and named, not silently dropped.
    expect(result.structuredContent?.activities_skipped).toBe(1);
    expect(result.structuredContent?.warnings).toEqual([
      "1 activity could not be fetched, so their efforts are missing below.",
    ]);
    expect(result.content[0]?.text).toContain("1 activity skipped");
  });

  it("bounds how many activity fetches are in flight at once", async () => {
    // #239: the scan used to be a serial loop, so the default 100 activities
    // cost 100 sequential round-trips.
    const activities = Array.from({ length: 20 }, (_, i) =>
      asSummary({ ...basicRunActivity, id: i + 1 }),
    );
    mockedList.mockResolvedValueOnce(activities);

    let inFlight = 0;
    let peakInFlight = 0;
    mockedById.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return asDetail(activityWithBestEfforts);
    });

    await getBestEffortsTool.execute(
      { limit: 3, maxActivities: 100 },
      "test-token",
    );

    expect(mockedById).toHaveBeenCalledTimes(20);
    expect(peakInFlight).toBeGreaterThan(1);
    expect(peakInFlight).toBeLessThanOrEqual(5);
  });

  it("stops the scan on a rate limit and says how many were skipped", async () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      asSummary({ ...basicRunActivity, id: i + 1 }),
    );
    mockedList.mockResolvedValueOnce(activities);

    let calls = 0;
    mockedById.mockImplementation(async () => {
      calls += 1;
      if (calls > 5) {
        throw new RateLimitError(
          "15-minute rate limit reached (100/100 requests).",
          { status: 429, statusText: "Too Many Requests", data: "" },
          { observedAt: Date.now(), shortTerm: { limit: 100, usage: 100 } },
          60,
        );
      }
      return asDetail(activityWithBestEfforts);
    });

    const result = await getBestEffortsTool.execute(
      { limit: 3, maxActivities: 100 },
      "test-token",
    );

    // The table is still returned — but it no longer claims to be complete.
    expect(result.isError).toBeUndefined();
    expect(mockedById.mock.calls.length).toBeLessThan(20);
    expect(result.structuredContent?.activities_skipped).toBeGreaterThan(0);
    const warning = result.structuredContent?.warnings?.[0] ?? "";
    expect(warning).toContain("rate limit was reached part-way");
    expect(warning).toContain("15-minute rate limit reached");
    expect(result.content[0]?.text).toContain("results below are incomplete");
  });

  it("scopes the scan to a date window when after/before are given", async () => {
    mockedList.mockResolvedValueOnce([]);

    await getBestEffortsTool.execute(
      {
        limit: 3,
        maxActivities: 100,
        after: "2026-01-01",
        before: "2026-06-30T23:59:59Z",
      },
      "test-token",
    );

    expect(mockedList).toHaveBeenCalledWith("test-token", {
      perPage: 100,
      maxItems: 100,
      countActivity: expect.any(Function),
      after: Math.floor(Date.parse("2026-01-01") / 1000),
      before: Math.floor(Date.parse("2026-06-30T23:59:59Z") / 1000),
    });
  });

  it("reports a clean scan with no skips and no warnings", async () => {
    mockedList.mockResolvedValueOnce([asSummary(activityWithBestEfforts)]);
    mockedById.mockResolvedValueOnce(asDetail(activityWithBestEfforts));

    const result = await getBestEffortsTool.execute(
      { limit: 3, maxActivities: 100 },
      "test-token",
    );

    expect(result.structuredContent?.activities_analyzed).toBe(1);
    expect(result.structuredContent?.activities_skipped).toBe(0);
    expect(result.structuredContent?.warnings).toEqual([]);
    expect(result.content[0]?.text).not.toContain("skipped");
  });

  it("returns an error result when the listing call throws", async () => {
    mockedList.mockRejectedValueOnce(new Error("network down"));

    const result = await getBestEffortsTool.execute(
      {
        limit: 3,
        maxActivities: 100,
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("network down");
  });
});
