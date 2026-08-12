import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  basicRunActivity,
  handledRateLimit,
  rideActivity,
} from "../__fixtures__";
import {
  getActivityById,
  getAllActivities,
  type StravaDetailedActivity,
  type StravaSummaryActivity,
} from "../stravaClient";
import { getRacePredictionTool } from "./getRacePrediction";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
  getActivityById: vi.fn(),
}));

const mockedList = vi.mocked(getAllActivities);
const mockedById = vi.mocked(getActivityById);

const asSummary = (a: unknown) => a as unknown as StravaSummaryActivity;
const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

/** Today, so fixture dates can be built relative to the run date. */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;

/**
 * An activity carrying one best effort, dated `days` ago. The id is a string
 * because `StravaIdSchema` transforms every id to its digit string — these
 * fixtures stand in for parsed client output, not raw Strava JSON.
 */
const activityWithEffort = (
  id: number,
  effortName: string,
  distance: number,
  elapsed: number,
  days = 20,
) => ({
  ...basicRunActivity,
  id: String(id),
  name: `Run ${id}`,
  best_efforts: [
    {
      id: id * 10,
      name: effortName,
      distance,
      elapsed_time: elapsed,
      moving_time: elapsed,
      start_date: `${daysAgo(days)}T08:00:00Z`,
      start_date_local: `${daysAgo(days)}T08:00:00Z`,
      pr_rank: 1,
    },
  ],
});

const run = (args: Record<string, unknown> = {}) =>
  getRacePredictionTool.execute(
    { maxActivities: 100, ...args } as Parameters<
      typeof getRacePredictionTool.execute
    >[0],
    "test-token",
  );

type RunResult = Awaited<ReturnType<typeof run>>;
type Structured = NonNullable<RunResult["structuredContent"]>;

/** Narrow past the optional structuredContent so assertions read cleanly. */
function payload(result: RunResult): Structured {
  const structured = result.structuredContent;
  if (!structured) throw new Error("expected structuredContent");
  return structured;
}

function prediction(result: RunResult, distance: string) {
  const found = payload(result).predictions.find(
    (p) => p.distance === distance,
  );
  if (!found) throw new Error(`no prediction for ${distance}`);
  return found;
}

function target(result: RunResult) {
  const found = payload(result).target;
  if (!found) throw new Error("expected a target race");
  return found;
}

describe("getRacePredictionTool.execute", () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedById.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bounds the listing to running activities", async () => {
    mockedList.mockResolvedValueOnce([]);

    await run({ maxActivities: 1000 });

    expect(mockedList).toHaveBeenCalledWith("test-token", {
      perPage: 200,
      maxItems: 1000,
      countActivity: expect.any(Function),
    });
    const countActivity = mockedList.mock.calls[0]?.[1]?.countActivity;
    expect(countActivity?.(asSummary(basicRunActivity))).toBe(true);
    expect(countActivity?.(asSummary(rideActivity))).toBe(false);
  });

  it("only fetches details for running activities", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary(basicRunActivity),
      asSummary(rideActivity),
    ]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    await run();

    expect(mockedById).toHaveBeenCalledTimes(1);
  });

  it("scopes the scan to a date window when after/before are given", async () => {
    mockedList.mockResolvedValueOnce([]);

    await run({ after: "2026-01-01", before: "2026-06-30T23:59:59Z" });

    expect(mockedList).toHaveBeenCalledWith("test-token", {
      perPage: 100,
      maxItems: 100,
      countActivity: expect.any(Function),
      after: Math.floor(Date.parse("2026-01-01") / 1000),
      before: Math.floor(Date.parse("2026-06-30T23:59:59Z") / 1000),
    });
  });

  it("predicts the four standard distances from one 10K effort", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run();

    const labels = payload(result).predictions.map((p) => p.distance);
    expect(labels).toEqual(["5K", "10K", "Half Marathon", "Marathon"]);

    // The 10K prediction is the source time itself.
    const tenK = prediction(result, "10K");
    expect(tenK.predicted_seconds).toBe(2400);
    expect(tenK.predicted_formatted).toBe("40:00");
    expect(tenK.pace.min_per_km).toBe("4:00");
    expect(tenK.primary_source.name).toBe("10K");

    expect(result.content[0]?.text).toContain("Race Prediction");
    expect(result.content[0]?.text).toContain("Equivalent performances");
  });

  it("excludes efforts shorter than the Riegel floor from the inputs", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary({ ...basicRunActivity, id: 1 }),
      asSummary({ ...basicRunActivity, id: 2 }),
    ]);
    mockedById
      .mockResolvedValueOnce(asDetail(activityWithEffort(1, "400m", 400, 70)))
      .mockResolvedValueOnce(asDetail(activityWithEffort(2, "5K", 5000, 1200)));

    const result = await run();

    const sourceNames = payload(result).sources.map((source) => source.name);
    expect(sourceNames).toEqual(["5K"]);
  });

  it("reports a helpful message when no usable efforts exist", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail({ ...basicRunActivity, best_efforts: [] }),
    );

    const result = await run();

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.predictions).toEqual([]);
    expect(result.structuredContent?.target).toBeNull();
    expect(result.content[0]?.text).toContain("Not enough to predict from");
  });

  it("builds km, mile, and negative-split tables for the requested race", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run({ raceDistance: "Half Marathon" });

    const race = target(result);
    expect(race.distance).toBe("Half Marathon");
    expect(race.basis).toBe("predicted");
    expect(race.goal_vs_predicted_seconds).toBeNull();

    const strategies = race.splits.map((s) => `${s.unit}:${s.strategy}`);
    expect(strategies).toEqual(["km:even", "mile:even", "km:negative"]);

    // A half is 21.0975 km: 21 full kilometres plus a partial.
    expect(race.splits[0]?.splits).toHaveLength(22);
    expect(result.content[0]?.text).toContain("Even splits — kilometres");
    expect(result.content[0]?.text).toContain("Negative split");
  });

  it("paces the splits to a goal time and grades it against the prediction", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run({
      raceDistance: "Half Marathon",
      goalTime: "1:45:00",
    });

    const race = target(result);
    expect(race.basis).toBe("goal");
    expect(race.total_seconds).toBe(6300);
    expect(race.total_formatted).toBe("1:45:00");
    expect(race.splits[0]?.total_seconds).toBe(6300);
    // 40:00 for 10K predicts ~1:29 for a half, so 1:45 is conservative.
    expect(race.goal_vs_predicted_seconds).toBeGreaterThan(0);
    expect(race.goal_assessment).toContain("conservative");
  });

  it("calls a goal within 2% of the prediction realistic, not conservative", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    // 40:00 for 10K predicts 40:00 for 10K, so 40:20 is 0.8% slower —
    // matching the prediction, not a soft target.
    const result = await run({ raceDistance: "10K", goalTime: "40:20" });

    const race = target(result);
    expect(race.goal_vs_predicted_seconds).toBe(20);
    expect(race.goal_assessment).toContain("right on what your efforts");
    expect(race.goal_assessment).not.toContain("conservative");
  });

  it("warns when the goal is far faster than the prediction", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run({
      raceDistance: "Half Marathon",
      goalTime: "1:15:00",
    });

    const race = target(result);
    expect(race.goal_vs_predicted_seconds).toBeLessThan(0);
    expect(race.goal_assessment).toContain("risks blowing up");
  });

  it("rejects an unparseable goal time before scanning anything", async () => {
    const result = await run({ raceDistance: "10K", goalTime: "soon" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Could not read");
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("adds a non-standard requested race to the prediction table", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run({ raceDistance: "15K" });

    const labels = payload(result).predictions.map((p) => p.distance);
    // Inserted in distance order, not appended.
    expect(labels).toEqual(["5K", "10K", "15K", "Half Marathon", "Marathon"]);
  });

  it("prompts for raceDistance when only predictions were asked for", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "10K", 10000, 2400)),
    );

    const result = await run();

    expect(result.structuredContent?.target).toBeNull();
    expect(result.content[0]?.text).toContain("Pass raceDistance");
  });

  it("weights a recent effort over a stale one and says which drove it", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary({ ...basicRunActivity, id: 1 }),
      asSummary({ ...basicRunActivity, id: 2 }),
    ]);
    mockedById
      // A blistering 10K from two years ago...
      .mockResolvedValueOnce(
        asDetail(activityWithEffort(1, "10K", 10000, 2100, 730)),
      )
      // ...and a slower one from last week.
      .mockResolvedValueOnce(
        asDetail(activityWithEffort(2, "10K", 10001, 2500, 7)),
      );

    const result = await run();

    const tenK = prediction(result, "10K");
    expect(tenK.primary_source.activity_id).toBe("2");
    // The stale PR still contributes, so the consensus sits between them.
    expect(tenK.predicted_seconds).toBeLessThan(2500);
    expect(tenK.predicted_seconds).toBeGreaterThan(2100);
    expect(tenK.spread?.range_seconds).toBe(400);
  });

  it("grades a marathon predicted only from a 5K as low confidence", async () => {
    mockedList.mockResolvedValueOnce([asSummary(basicRunActivity)]);
    mockedById.mockResolvedValueOnce(
      asDetail(activityWithEffort(1, "5K", 5000, 1200)),
    );

    const result = await run();

    const marathon = prediction(result, "Marathon");
    expect(marathon.confidence).toBe("low");
    expect(marathon.confidence_notes.join(" ")).toContain(
      "beyond your longest",
    );
  });

  it("skips activities that fail to fetch and says so", async () => {
    mockedList.mockResolvedValueOnce([
      asSummary({ ...basicRunActivity, id: 1 }),
      asSummary({ ...basicRunActivity, id: 2 }),
    ]);
    mockedById
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(
        asDetail(activityWithEffort(2, "10K", 10000, 2400)),
      );

    const result = await run();

    expect(result.structuredContent?.activities_skipped).toBe(1);
    expect(result.structuredContent?.warnings?.[0]).toContain(
      "could not be fetched",
    );
    // The surviving effort still produces a prediction.
    expect(result.structuredContent?.predictions?.length).toBeGreaterThan(0);
  });

  it("stops the scan on a rate limit and flags the partial set", async () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      asSummary({ ...basicRunActivity, id: i + 1 }),
    );
    mockedList.mockResolvedValueOnce(activities);

    let calls = 0;
    mockedById.mockImplementation(async () => {
      calls += 1;
      // The shape `getActivityById` really throws — see handledRateLimit.
      if (calls > 5) throw handledRateLimit(`getActivityById for ID ${calls}`);
      return asDetail(activityWithEffort(calls, "10K", 10000, 2400));
    });

    const result = await run();

    expect(result.isError).toBeUndefined();
    expect(mockedById.mock.calls.length).toBeLessThan(20);
    expect(result.structuredContent?.activities_skipped).toBeGreaterThan(0);
    const warning = result.structuredContent?.warnings?.[0] ?? "";
    expect(warning).toContain("rate limit was reached part-way");
    expect(warning).toContain("15-minute rate limit reached");
    expect(warning).not.toContain("getActivityById");
    expect(result.content[0]?.text).toContain("partial set");
  });

  it("bounds how many activity fetches are in flight at once", async () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      asSummary({ ...basicRunActivity, id: i + 1 }),
    );
    mockedList.mockResolvedValueOnce(activities);

    let inFlight = 0;
    let peak = 0;
    mockedById.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return asDetail(activityWithEffort(1, "10K", 10000, 2400));
    });

    await run();

    expect(mockedById).toHaveBeenCalledTimes(20);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("returns an error result when the listing call throws", async () => {
    mockedList.mockRejectedValueOnce(new Error("network down"));

    const result = await run();

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("network down");
  });
});
