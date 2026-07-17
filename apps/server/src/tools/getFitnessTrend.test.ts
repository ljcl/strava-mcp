import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllActivities, type StravaSummaryActivity } from "../stravaClient";
import { getFitnessTrendTool } from "./getFitnessTrend";
import { FitnessTrendOutputSchema } from "./outputs";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
}));

const mockedList = vi.mocked(getAllActivities);

const DEFAULT_INPUT = { days: 90, projectDays: 0 };

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
    suffer_score: 60,
    ...overrides,
  } as unknown as StravaSummaryActivity;
}

describe("get-fitness-trend execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedList.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("computes CTL/ATL/TSB and valid structured output", async () => {
    mockedList.mockResolvedValueOnce([run(1), run(3), run(5), run(8)]);

    const result = await getFitnessTrendTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      period: { days: number };
      current: { ctl: number; atl: number; tsb: number } | null;
      daily: unknown[];
      activities_included: number;
      activities_missing_load: number;
    };
    expect(structured.period.days).toBe(90);
    expect(structured.daily).toHaveLength(90);
    expect(structured.activities_included).toBe(4);
    expect(structured.activities_missing_load).toBe(0);
    expect(structured.current!.ctl).toBeGreaterThan(0);
    // Recent-only load: fatigue outweighs fitness.
    expect(structured.current!.tsb).toBeLessThan(0);
    expect(FitnessTrendOutputSchema.safeParse(structured).success).toBe(true);

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Fitness Trend (CTL/ATL/TSB)");
    expect(text).toContain("Fitness (CTL):");
    expect(text).toContain("Form (TSB):");
  });

  it("includes all sports by default and filters via activityTypes", async () => {
    const activities = [
      run(2),
      run(3, { id: "ride", type: "Ride", sport_type: "Ride" }),
    ];
    mockedList.mockResolvedValueOnce(activities);

    const all = await getFitnessTrendTool.execute(DEFAULT_INPUT);
    expect(
      (all.structuredContent as { activities_included: number })
        .activities_included,
    ).toBe(2);

    mockedList.mockResolvedValueOnce(activities);
    const runsOnly = await getFitnessTrendTool.execute({
      ...DEFAULT_INPUT,
      activityTypes: ["Run"],
    });
    expect(
      (runsOnly.structuredContent as { activities_included: number })
        .activities_included,
    ).toBe(1);
  });

  it("counts activities without relative effort and warns", async () => {
    mockedList.mockResolvedValueOnce([
      run(2),
      run(4, { id: "no-hr", suffer_score: null }),
    ]);

    const result = await getFitnessTrendTool.execute(DEFAULT_INPUT);

    const structured = result.structuredContent as {
      activities_missing_load: number;
      warnings: string[];
    };
    expect(structured.activities_missing_load).toBe(1);
    expect(structured.warnings.join(" ")).toContain("no relative effort");
  });

  it("projects forward and reports the TSB-positive date", async () => {
    mockedList.mockResolvedValueOnce([
      run(1, { suffer_score: 150 }),
      run(2, { suffer_score: 150 }),
      run(3, { suffer_score: 150 }),
      run(4, { suffer_score: 150 }),
    ]);

    const result = await getFitnessTrendTool.execute({
      days: 90,
      projectDays: 30,
    });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      projection: unknown[];
      tsb_positive_date: string | null;
    };
    expect(structured.projection).toHaveLength(30);
    expect(structured.tsb_positive_date).not.toBeNull();
    expect(result.content[0]?.text).toContain("TSB returns positive on");
  });

  it("warns on a short window", async () => {
    mockedList.mockResolvedValueOnce([run(2)]);

    const result = await getFitnessTrendTool.execute({
      days: 28,
      projectDays: 0,
    });

    const structured = result.structuredContent as { warnings: string[] };
    expect(structured.warnings.join(" ")).toContain("runway");
  });

  it("handles an empty window without erroring", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await getFitnessTrendTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      current: unknown;
      warnings: string[];
    };
    expect(structured.warnings.join(" ")).toContain("No matching activities");
    expect(FitnessTrendOutputSchema.safeParse(structured).success).toBe(true);
  });

  it("errors without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getFitnessTrendTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
  });

  it("surfaces API failures as tool errors", async () => {
    mockedList.mockRejectedValueOnce(new Error("Strava API blew up"));

    const result = await getFitnessTrendTool.execute(DEFAULT_INPUT);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Strava API blew up");
  });
});
