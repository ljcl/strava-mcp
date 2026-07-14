import { describe, expect, it } from "vitest";
import { buildTotalsStats, countWarningWeeks, formatHours } from "./normalize";
import { type WeekSummary } from "./types";

describe("formatHours", () => {
  it("formats hours and minutes", () => {
    expect(formatHours(27.75)).toBe("27h 45m");
  });

  it("drops the minutes on a whole hour", () => {
    expect(formatHours(3)).toBe("3h");
  });

  it("shows only minutes under an hour", () => {
    expect(formatHours(0.5)).toBe("30m");
  });

  it("rounds to the nearest minute", () => {
    expect(formatHours(1.999)).toBe("2h");
  });
});

describe("buildTotalsStats", () => {
  it("formats the four totals in order", () => {
    const stats = buildTotalsStats({
      runs: 34,
      distanceKm: 312.4,
      timeHours: 27.75,
      elevationM: 2810,
    });
    expect(stats.map((s) => s.label)).toEqual([
      "Runs",
      "Distance",
      "Time",
      "Elevation",
    ]);
    expect(stats[0]!.value).toBe("34");
    expect(stats[1]!.value).toBe("312.4 km");
    expect(stats[2]!.value).toBe("27h 45m");
    expect(stats[3]!.value).toBe("2,810 m");
  });
});

describe("countWarningWeeks", () => {
  const week = (warning: boolean): WeekSummary => ({
    weekStarting: "2026-06-01",
    runs: 1,
    distanceKm: 10,
    timeHours: 1,
    elevationM: 50,
    trendKm: 10,
    warning,
    warningReasons: warning ? ["reason"] : [],
  });

  it("counts only flagged weeks", () => {
    expect(countWarningWeeks([week(true), week(false), week(true)])).toBe(2);
  });
});
