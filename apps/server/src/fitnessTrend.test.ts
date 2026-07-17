import { describe, expect, it } from "vitest";
import {
  ATL_TIME_CONSTANT_DAYS,
  buildFitnessTrend,
  CTL_TIME_CONSTANT_DAYS,
  computeFlags,
  DEEP_FATIGUE_DAYS,
  DEEP_FATIGUE_TSB,
  dailyLoads,
  type FitnessTrendActivity,
  type FitnessTrendDay,
} from "./fitnessTrend";

function activity(
  date: string,
  sufferScore: number | null | undefined,
): FitnessTrendActivity {
  return {
    start_date: `${date}T20:00:00Z`,
    start_date_local: `${date}T06:00:00`,
    suffer_score: sufferScore,
  };
}

describe("dailyLoads", () => {
  it("sums multiple activities on the same local day", () => {
    const loads = dailyLoads([
      activity("2026-07-01", 40),
      activity("2026-07-01", 25),
      activity("2026-07-02", 10),
    ]);
    expect(loads.get("2026-07-01")).toBe(65);
    expect(loads.get("2026-07-02")).toBe(10);
  });

  it("uses the local date, not the UTC date", () => {
    // start_date is late UTC on the 1st but start_date_local is the 2nd.
    const loads = dailyLoads([
      {
        start_date: "2026-07-01T22:00:00Z",
        start_date_local: "2026-07-02T08:00:00",
        suffer_score: 30,
      },
    ]);
    expect(loads.get("2026-07-02")).toBe(30);
    expect(loads.has("2026-07-01")).toBe(false);
  });

  it("treats a missing suffer_score as zero load", () => {
    const loads = dailyLoads([
      activity("2026-07-01", null),
      activity("2026-07-01", undefined),
    ]);
    expect(loads.get("2026-07-01")).toBe(0);
  });
});

describe("buildFitnessTrend", () => {
  it("returns an all-zero series with no activities", () => {
    const trend = buildFitnessTrend([], { endDate: "2026-07-10", days: 5 });
    expect(trend.days).toHaveLength(5);
    expect(trend.days[0]!.date).toBe("2026-07-06");
    expect(trend.days[4]!.date).toBe("2026-07-10");
    for (const day of trend.days) {
      expect(day).toMatchObject({ load: 0, ctl: 0, atl: 0, tsb: 0 });
    }
    expect(trend.current).toEqual(trend.days[4]);
    expect(trend.flags).toEqual([]);
  });

  it("converges CTL and ATL toward a constant daily load", () => {
    const activities: FitnessTrendActivity[] = [];
    for (let i = 0; i < 300; i++) {
      const d = new Date(Date.UTC(2025, 8, 1));
      d.setUTCDate(d.getUTCDate() + i);
      activities.push(activity(d.toISOString().split("T")[0]!, 50));
    }
    const trend = buildFitnessTrend(activities, {
      endDate: "2026-06-27",
      days: 300,
    });
    const current = trend.current!;
    expect(current.ctl).toBeCloseTo(50, 0);
    expect(current.atl).toBeCloseTo(50, 0);
    expect(Math.abs(current.tsb)).toBeLessThan(1);
  });

  it("responds faster in ATL than CTL after a big day", () => {
    const trend = buildFitnessTrend([activity("2026-07-09", 100)], {
      endDate: "2026-07-10",
      days: 30,
    });
    const bigDay = trend.days.find((d) => d.date === "2026-07-09")!;
    // First responses: load * (1 − e^(−1/tc)).
    expect(bigDay.atl).toBeCloseTo(
      100 * (1 - Math.exp(-1 / ATL_TIME_CONSTANT_DAYS)),
      1,
    );
    expect(bigDay.ctl).toBeCloseTo(
      100 * (1 - Math.exp(-1 / CTL_TIME_CONSTANT_DAYS)),
      1,
    );
    expect(bigDay.atl).toBeGreaterThan(bigDay.ctl);
    expect(bigDay.tsb).toBeLessThan(0);
  });

  it("decays both curves through rest days", () => {
    const trend = buildFitnessTrend([activity("2026-07-01", 80)], {
      endDate: "2026-07-10",
      days: 20,
    });
    const loaded = trend.days.find((d) => d.date === "2026-07-01")!;
    const later = trend.days.find((d) => d.date === "2026-07-08")!;
    expect(later.ctl).toBeLessThan(loaded.ctl);
    expect(later.atl).toBeLessThan(loaded.atl);
    // A week after a single spike, fatigue has faded faster than fitness.
    expect(later.tsb).toBeGreaterThan(loaded.tsb);
  });

  it("projects zero-load decay and finds the TSB-positive date", () => {
    // Heavy recent week on top of little background: negative TSB now.
    const activities: FitnessTrendActivity[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 6, 4 + i));
      activities.push(activity(d.toISOString().split("T")[0]!, 120));
    }
    const trend = buildFitnessTrend(activities, {
      endDate: "2026-07-10",
      days: 60,
      projectDays: 21,
    });
    expect(trend.current!.tsb).toBeLessThan(0);
    expect(trend.projection).toHaveLength(21);
    expect(trend.projection[0]!.date).toBe("2026-07-11");
    expect(trend.tsbPositiveDate).not.toBeNull();
    const positive = trend.projection.find(
      (d) => d.date === trend.tsbPositiveDate,
    )!;
    expect(positive.tsb).toBeGreaterThanOrEqual(0);
    const before = trend.projection[trend.projection.indexOf(positive) - 1];
    if (before) expect(before.tsb).toBeLessThan(0);
    // Zero-load projection: fitness only decays.
    expect(trend.projection[20]!.ctl).toBeLessThan(trend.current!.ctl);
  });

  it("returns null tsbPositiveDate when the projection stays negative", () => {
    const activities: FitnessTrendActivity[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.UTC(2026, 6, 6 + i));
      activities.push(activity(d.toISOString().split("T")[0]!, 200));
    }
    const trend = buildFitnessTrend(activities, {
      endDate: "2026-07-10",
      days: 30,
      projectDays: 2,
    });
    expect(trend.current!.tsb).toBeLessThan(0);
    expect(trend.tsbPositiveDate).toBeNull();
  });
});

describe("computeFlags", () => {
  function day(date: string, tsb: number, ctl = 50): FitnessTrendDay {
    return { date, load: 0, ctl, atl: ctl - tsb, tsb };
  }

  it("flags deep fatigue only when the streak reaches the window end", () => {
    const deep = Array.from({ length: DEEP_FATIGUE_DAYS }, (_, i) =>
      day(`2026-07-0${i + 1}`, DEEP_FATIGUE_TSB - 1),
    );
    expect(computeFlags(deep).join(" ")).toContain("deep fatigue");

    // Same streak but resolved (a fresh day after it): no flag.
    const resolved = [...deep, day("2026-07-06", 0)];
    expect(
      computeFlags(resolved).find((f) => f.includes("deep fatigue")),
    ).toBeUndefined();
  });

  it("does not flag a short deep-fatigue streak", () => {
    const days = [
      day("2026-07-01", 0),
      day("2026-07-02", DEEP_FATIGUE_TSB - 5),
      day("2026-07-03", DEEP_FATIGUE_TSB - 5),
    ];
    expect(
      computeFlags(days).find((f) => f.includes("deep fatigue")),
    ).toBeUndefined();
  });

  it("flags freshness at high positive TSB", () => {
    expect(computeFlags([day("2026-07-01", 20)]).join(" ")).toContain("fresh");
  });

  it("flags a steep CTL ramp over the trailing week", () => {
    const days = Array.from({ length: 9 }, (_, i) =>
      day(`2026-07-0${i + 1}`, -5, 40 + i),
    );
    expect(computeFlags(days).join(" ")).toContain("CTL climbed");
  });

  it("returns nothing for an empty series", () => {
    expect(computeFlags([])).toEqual([]);
  });
});
