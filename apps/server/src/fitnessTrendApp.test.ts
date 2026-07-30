import { describe, expect, it } from "vitest";
import { buildFitnessTrend, type FitnessTrendActivity } from "./fitnessTrend";
import { mapFitnessTrendApp } from "./fitnessTrendApp";

/** Three weeks of daily load ending 2026-06-28. */
function block(): FitnessTrendActivity[] {
  return Array.from({ length: 21 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 28));
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().split("T")[0]!;
    return {
      start_date: `${date}T07:00:00Z`,
      start_date_local: `${date}T07:00:00`,
      suffer_score: 120,
    };
  });
}

const META = { days: 90, activitiesIncluded: 21, activitiesMissingLoad: 2 };

describe("mapFitnessTrendApp", () => {
  it("carries the series, projection, and meta through unchanged", () => {
    const trend = buildFitnessTrend(block(), {
      endDate: "2026-06-28",
      days: 90,
      projectDays: 14,
    });

    const data = mapFitnessTrendApp(trend, META);

    expect(data.days).toBe(90);
    expect(data.series).toBe(trend.days);
    expect(data.projection).toBe(trend.projection);
    expect(data.current).toBe(trend.current);
    expect(data.tsbPositiveDate).toBe(trend.tsbPositiveDate);
    expect(data.flags).toBe(trend.flags);
    expect(data.activitiesIncluded).toBe(21);
    expect(data.activitiesMissingLoad).toBe(2);
    expect(data.taper).toBeNull();
  });

  it("renames the band fields to camelCase without losing any", () => {
    const trend = buildFitnessTrend(block(), {
      endDate: "2026-06-28",
      days: 90,
    });

    const data = mapFitnessTrendApp(trend, META);

    expect(data.bands).toHaveLength(trend.bands.length);
    expect(data.bands.length).toBeGreaterThan(0);
    for (const [i, band] of data.bands.entries()) {
      const source = trend.bands[i]!;
      expect(band).toEqual({
        kind: source.kind,
        startDate: source.start_date,
        endDate: source.end_date,
        days: source.days,
        reason: source.reason,
      });
    }
  });

  it("renames the taper plan and its weeks", () => {
    const trend = buildFitnessTrend(block(), {
      endDate: "2026-06-28",
      days: 90,
      taper: { targetDate: "2026-07-19", targetTsb: 10 },
    });

    const taper = mapFitnessTrendApp(trend, META).taper!;
    const source = trend.taper!;

    expect(taper.targetDate).toBe(source.target_date);
    expect(taper.targetTsb).toBe(source.target_tsb);
    expect(taper.achievedTsb).toBe(source.achieved_tsb);
    expect(taper.feasible).toBe(source.feasible);
    expect(taper.note).toBe(source.note);
    expect(taper.totalLoad).toBe(source.total_load);
    expect(taper.recentDailyLoad).toBe(source.recent_daily_load);
    expect(taper.days).toBe(source.days);
    expect(taper.weeks).toHaveLength(3);
    expect(taper.weeks[0]).toEqual({
      week: source.weeks[0]!.week,
      startDate: source.weeks[0]!.start_date,
      endDate: source.weeks[0]!.end_date,
      days: source.weeks[0]!.days,
      dailyLoad: source.weeks[0]!.daily_load,
      weekLoad: source.weeks[0]!.week_load,
      pctOfRecent: source.weeks[0]!.pct_of_recent,
    });
  });

  it("leaves no snake_case key in the payload the app parses", () => {
    const trend = buildFitnessTrend(block(), {
      endDate: "2026-06-28",
      days: 90,
      projectDays: 7,
      taper: { targetDate: "2026-07-12", targetTsb: 5 },
    });

    const json = JSON.stringify(mapFitnessTrendApp(trend, META));
    for (const key of json.match(/"[a-z_]+":/g) ?? []) {
      expect(key, `${key} should be camelCase`).not.toContain("_");
    }
  });
});
