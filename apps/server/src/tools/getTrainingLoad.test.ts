import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllActivities, type StravaSummaryActivity } from "../stravaClient";
import { getTrainingLoadTool } from "./getTrainingLoad";
import { TrainingLoadOutputSchema } from "./outputs";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
}));

const mockedList = vi.mocked(getAllActivities);

const DEFAULT_INPUT = {
  days: 28,
  activityTypes: ["Run", "TrailRun", "VirtualRun"],
};

function run(
  daysAgo: number,
  overrides: Record<string, unknown> = {},
): StravaSummaryActivity {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    id: `run-${daysAgo}`,
    name: `Run ${daysAgo}d ago`,
    type: "Run",
    sport_type: "Run",
    start_date: date.toISOString(),
    start_date_local: date.toISOString(),
    distance: 10000,
    moving_time: 3600,
    total_elevation_gain: 100,
    ...overrides,
  } as unknown as StravaSummaryActivity;
}

describe("get-training-load execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedList.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("aggregates runs into weekly totals and structured output", async () => {
    mockedList.mockResolvedValueOnce([run(2), run(9), run(9.5)]);

    const result = await getTrainingLoadTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      period: { days: number };
      totals: { runs: number; distance_km: number };
      weekly_breakdown: unknown[];
    };
    expect(structured.period.days).toBe(28);
    expect(structured.totals.runs).toBe(3);
    expect(structured.totals.distance_km).toBe(30);
    expect(structured.weekly_breakdown.length).toBeGreaterThanOrEqual(1);
    expect(TrainingLoadOutputSchema.safeParse(structured).success).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Training Load Summary");
    expect(text).toContain("Runs: 3");
  });

  it("filters out non-matching activity types", async () => {
    mockedList.mockResolvedValueOnce([
      run(2),
      run(3, { id: "ride", type: "Ride", sport_type: "Ride" }),
    ]);

    const result = await getTrainingLoadTool.execute(DEFAULT_INPUT);

    const structured = result.structuredContent as {
      totals: { runs: number };
    };
    expect(structured.totals.runs).toBe(1);
  });

  it("reports insufficient data for a short history", async () => {
    mockedList.mockResolvedValueOnce([run(2)]);

    const result = await getTrainingLoadTool.execute(DEFAULT_INPUT);

    const structured = result.structuredContent as { trend: string };
    expect(structured.trend).toBe("insufficient data");
  });

  it("returns isError when the fetch fails", async () => {
    mockedList.mockRejectedValueOnce(new Error("Rate limited"));

    const result = await getTrainingLoadTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Rate limited");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getTrainingLoadTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Missing Strava access token");
    expect(mockedList).not.toHaveBeenCalled();
  });
});
