/**
 * Regression tests for #107: tool input schemas are enforced at dispatch
 * time, so zod defaults apply when args are omitted and invalid args return
 * a structured error instead of flowing into Strava requests as NaN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityById,
  getAllActivities,
  getAthleteStats,
} from "./stravaClient";

vi.mock("./stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stravaClient")>();
  return {
    ...actual,
    getAllActivities: vi.fn(),
    getActivityById: vi.fn(),
    getAthleteStats: vi.fn(),
  };
});

// Import after the mock so server.ts's tool modules see the mocked client.
const { dispatchToolCall } = await import("./server");

const mockedList = vi.mocked(getAllActivities);
const mockedById = vi.mocked(getActivityById);
const mockedStats = vi.mocked(getAthleteStats);

describe("dispatchToolCall input validation", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedList.mockReset();
    mockedById.mockReset();
    mockedStats.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("applies zod defaults when optional args are omitted (get-best-efforts)", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-best-efforts", undefined);

    expect(result.isError).toBeUndefined();
    // Defaults applied: maxActivities 100, so perPage is min(100, 200) = 100
    // — previously Math.min(undefined, 200) produced per_page=NaN.
    expect(mockedList).toHaveBeenCalledWith("test-token", {
      perPage: 100,
      maxItems: 100,
      countActivity: expect.any(Function),
    });
  });

  it("applies zod defaults for get-training-load (no NaN after timestamp)", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-training-load", {});

    expect(result.isError).toBeUndefined();
    const params = mockedList.mock.calls[0]?.[1];
    expect(Number.isFinite(params?.after)).toBe(true);
  });

  it("rejects args above the documented bounds without calling Strava", async () => {
    const result = await dispatchToolCall("get-best-efforts", {
      maxActivities: 500,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Invalid arguments for get-best-efforts",
    );
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("rejects wrongly-typed args without calling Strava", async () => {
    const result = await dispatchToolCall("get-training-load", {
      days: "four weeks",
    });

    expect(result.isError).toBe(true);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("rejects an app tool call missing its required activity_id", async () => {
    const result = await dispatchToolCall("view-activity-chart", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Invalid arguments for view-activity-chart",
    );
    expect(mockedById).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric activity_id for app tools", async () => {
    const result = await dispatchToolCall("get-activity-streams-raw", {
      activity_id: "not-an-id",
    });

    expect(result.isError).toBe(true);
    expect(mockedById).not.toHaveBeenCalled();
  });

  it("applies the weeks default for app tools", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-cadence-trend-data", {});

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(JSON.parse(text).weeks).toBe(6);
  });

  it("applies the days default for get-training-load-data", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-training-load-data", {});

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual({
      days: 84,
      totals: { runs: 0, distanceKm: 0, timeHours: 0, elevationM: 0 },
      weeks: [],
    });
    const params = mockedList.mock.calls[0]?.[1];
    expect(Number.isFinite(params?.after)).toBe(true);
  });

  it("rejects days above the documented bound for view-training-load", async () => {
    const result = await dispatchToolCall("view-training-load", { days: 900 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Invalid arguments for view-training-load",
    );
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("returns a structured error for unknown tools", async () => {
    const result = await dispatchToolCall("not-a-tool", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Unknown tool: not-a-tool");
  });
});
