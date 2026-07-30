import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllActivities, type StravaSummaryActivity } from "../stravaClient";
import { getFitnessTrendTool } from "./getFitnessTrend";
import { FitnessTrendOutputSchema } from "./outputs";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
}));

const mockedList = vi.mocked(getAllActivities);

const DEFAULT_INPUT = { days: 90, projectDays: 0, targetTsb: 10 };

/** YYYY-MM-DD `days` from today, for taper target dates. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;
}

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

    const result = await getFitnessTrendTool.execute(
      DEFAULT_INPUT,
      "test-token",
    );

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

    const all = await getFitnessTrendTool.execute(DEFAULT_INPUT, "test-token");
    expect(
      (all.structuredContent as { activities_included: number })
        .activities_included,
    ).toBe(2);

    mockedList.mockResolvedValueOnce(activities);
    const runsOnly = await getFitnessTrendTool.execute(
      {
        ...DEFAULT_INPUT,
        activityTypes: ["Run"],
      },
      "test-token",
    );
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

    const result = await getFitnessTrendTool.execute(
      DEFAULT_INPUT,
      "test-token",
    );

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

    const result = await getFitnessTrendTool.execute(
      { ...DEFAULT_INPUT, projectDays: 30 },
      "test-token",
    );

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

    const result = await getFitnessTrendTool.execute(
      { ...DEFAULT_INPUT, days: 28 },
      "test-token",
    );

    const structured = result.structuredContent as { warnings: string[] };
    expect(structured.warnings.join(" ")).toContain("runway");
  });

  it("handles an empty window without erroring", async () => {
    mockedList.mockResolvedValueOnce([]);

    const result = await getFitnessTrendTool.execute(
      DEFAULT_INPUT,
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      current: unknown;
      warnings: string[];
    };
    expect(structured.warnings.join(" ")).toContain("No matching activities");
    expect(FitnessTrendOutputSchema.safeParse(structured).success).toBe(true);
  });

  it("solves a taper plan to a target date and prints the weekly plan", async () => {
    // Three weeks of solid load: fatigued now, worth tapering from.
    mockedList.mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, i) =>
        run(i + 1, { id: `run-${i}`, suffer_score: 80 }),
      ),
    );

    const targetDate = inDays(21);
    const result = await getFitnessTrendTool.execute(
      { ...DEFAULT_INPUT, targetDate },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      taper: {
        target_date: string;
        target_tsb: number;
        achieved_tsb: number;
        feasible: boolean;
        weeks: { week: number; daily_load: number; pct_of_recent: number }[];
        days: unknown[];
      } | null;
    };
    expect(structured.taper).not.toBeNull();
    const taper = structured.taper!;
    expect(taper.target_date).toBe(targetDate);
    expect(taper.target_tsb).toBe(10);
    expect(taper.achieved_tsb).toBeCloseTo(10, 1);
    expect(taper.feasible).toBe(true);
    expect(taper.weeks).toHaveLength(3);
    expect(taper.days).toHaveLength(21);
    expect(FitnessTrendOutputSchema.safeParse(structured).success).toBe(true);

    const text = result.content[0]?.text ?? "";
    expect(text).toContain(`Taper plan to ${targetDate} (target TSB +10)`);
    expect(text).toContain("Week 1 (");
    expect(text).toContain("% of recent weekly load");
    expect(text).toContain(`Lands ${targetDate}:`);
  });

  it("omits the taper when no target date is given", async () => {
    mockedList.mockResolvedValueOnce([run(2)]);

    const result = await getFitnessTrendTool.execute(
      DEFAULT_INPUT,
      "test-token",
    );

    expect((result.structuredContent as { taper: unknown }).taper).toBeNull();
    expect(result.content[0]?.text).not.toContain("Taper plan");
  });

  it("says so when even rest cannot reach the target in time", async () => {
    mockedList.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) =>
        run(i + 1, { id: `hard-${i}`, suffer_score: 200 }),
      ),
    );

    const result = await getFitnessTrendTool.execute(
      { ...DEFAULT_INPUT, targetDate: inDays(2), targetTsb: 25 },
      "test-token",
    );

    const taper = (
      result.structuredContent as {
        taper: { feasible: boolean; note: string; total_load: number };
      }
    ).taper;
    expect(taper.feasible).toBe(false);
    expect(taper.note).toContain("complete rest");
    expect(taper.total_load).toBe(0);
    expect(result.content[0]?.text).toContain("complete rest");
  });

  it("warns that a long plan is a training block, not a taper", async () => {
    mockedList.mockResolvedValueOnce([run(2, { suffer_score: 90 })]);

    const result = await getFitnessTrendTool.execute(
      { ...DEFAULT_INPUT, targetDate: inDays(60) },
      "test-token",
    );

    const structured = result.structuredContent as { warnings: string[] };
    expect(structured.warnings.join(" ")).toContain("training block");
  });

  it("surfaces API failures as tool errors", async () => {
    mockedList.mockRejectedValueOnce(new Error("Strava API blew up"));

    const result = await getFitnessTrendTool.execute(
      DEFAULT_INPUT,
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Strava API blew up");
  });
});
