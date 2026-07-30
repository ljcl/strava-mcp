import { describe, expect, it } from "vitest";
import {
  ATL_TIME_CONSTANT_DAYS,
  buildFitnessTrend,
  CTL_TIME_CONSTANT_DAYS,
  computeFlags,
  DEEP_FATIGUE_DAYS,
  DEEP_FATIGUE_TSB,
  dailyLoads,
  daysBetween,
  type FitnessTrendActivity,
  type FitnessTrendDay,
  FRESH_TSB,
  MAX_TAPER_DAILY_LOAD,
  RAMP_RISK_PER_WEEK,
  RECENT_LOAD_DAYS,
  recentDailyLoad,
  solveTaperPlan,
  TAPER_WEEK_DECAY,
  taperWeekWeights,
  trendBands,
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

describe("planned-load projection", () => {
  /** Five hard days a week for `weeks` weeks, ending on 2026-06-28. */
  function block(weeks: number): FitnessTrendActivity[] {
    const acts: FitnessTrendActivity[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(Date.UTC(2026, 5, 28));
      d.setUTCDate(d.getUTCDate() - i);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      acts.push(activity(d.toISOString().split("T")[0]!, 60));
    }
    return acts;
  }

  it("keeps the zero-load rest projection as the default", () => {
    const trend = buildFitnessTrend(block(12), {
      endDate: "2026-06-28",
      days: 84,
      projectDays: 5,
    });
    expect(trend.projection.map((d) => d.load)).toEqual([0, 0, 0, 0, 0]);
    expect(trend.taper).toBeNull();
  });

  it("projects consecutive planned loads and defaults projectDays to their length", () => {
    const trend = buildFitnessTrend(block(12), {
      endDate: "2026-06-28",
      days: 84,
      plannedLoads: [70, 0, 70],
    });
    expect(trend.projection).toHaveLength(3);
    expect(trend.projection.map((d) => [d.date, d.load])).toEqual([
      ["2026-06-29", 70],
      ["2026-06-30", 0],
      ["2026-07-01", 70],
    ]);
    // Loading past the window keeps fatigue up, so TSB sits below the
    // equivalent rest projection.
    const rest = buildFitnessTrend(block(12), {
      endDate: "2026-06-28",
      days: 84,
      projectDays: 3,
    });
    expect(trend.projection[2]!.tsb).toBeLessThan(rest.projection[2]!.tsb);
  });

  it("rests the days a dated plan does not name", () => {
    const trend = buildFitnessTrend(block(12), {
      endDate: "2026-06-28",
      days: 84,
      projectDays: 4,
      plannedLoads: [
        { date: "2026-06-30", load: 90 },
        { date: "2026-07-02", load: 45 },
      ],
    });
    expect(trend.projection.map((d) => d.load)).toEqual([0, 90, 0, 45]);
  });

  it("ignores planned days past the projection window", () => {
    const trend = buildFitnessTrend(block(12), {
      endDate: "2026-06-28",
      days: 84,
      projectDays: 1,
      plannedLoads: [50, 50, 50],
    });
    expect(trend.projection.map((d) => d.load)).toEqual([50]);
  });
});

describe("taperWeekWeights", () => {
  it("steps down one weight per week, first week heaviest", () => {
    expect(taperWeekWeights(21)).toEqual([
      1,
      TAPER_WEEK_DECAY,
      TAPER_WEEK_DECAY ** 2,
    ]);
  });

  it("counts a partial trailing week", () => {
    expect(taperWeekWeights(9)).toHaveLength(2);
    expect(taperWeekWeights(1)).toEqual([1]);
    expect(taperWeekWeights(0)).toEqual([1]);
  });
});

describe("recentDailyLoad", () => {
  it("averages the trailing window", () => {
    const series: FitnessTrendDay[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      load: i < 2 ? 999 : 10,
      ctl: 0,
      atl: 0,
      tsb: 0,
    }));
    // The two 999 days fall outside the trailing 28.
    expect(recentDailyLoad(series, RECENT_LOAD_DAYS)).toBe(10);
  });

  it("returns zero for an empty series", () => {
    expect(recentDailyLoad([], RECENT_LOAD_DAYS)).toBe(0);
  });
});

describe("solveTaperPlan", () => {
  // Mid-block state: fitness built up, carrying fatigue (TSB −15).
  const start = { ctl: 60, atl: 75 };

  it("lands on the target TSB on the target date", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-19", targetTsb: 10 },
      45,
    );
    expect(plan.feasible).toBe(true);
    expect(plan.note).toBeNull();
    expect(plan.achieved_tsb).toBeCloseTo(10, 1);
    expect(plan.days).toHaveLength(21);
    expect(plan.days[20]!.date).toBe("2026-07-19");
    expect(plan.days[20]!.tsb).toBeCloseTo(10, 1);
  });

  it("prescribes real training, stepping down week by week", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-19", targetTsb: 10 },
      45,
    );
    expect(plan.weeks).toHaveLength(3);
    expect(plan.weeks[0]!.daily_load).toBeGreaterThan(0);
    expect(plan.weeks[1]!.daily_load).toBeLessThan(plan.weeks[0]!.daily_load);
    expect(plan.weeks[2]!.daily_load).toBeLessThan(plan.weeks[1]!.daily_load);
    expect(plan.weeks.map((w) => w.days)).toEqual([7, 7, 7]);
    expect(plan.weeks[0]!.start_date).toBe("2026-06-29");
    expect(plan.weeks[2]!.end_date).toBe("2026-07-19");
    expect(plan.total_load).toBeCloseTo(
      plan.weeks.reduce((sum, w) => sum + w.week_load, 0),
      0,
    );
    // Reported against the 45/day the athlete has been averaging.
    expect(plan.weeks[0]!.pct_of_recent).toBeGreaterThan(0);
    expect(plan.recent_daily_load).toBe(45);
  });

  it("is a taper, not rest: more load than the zero-load projection", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-19", targetTsb: 10 },
      45,
    );
    const rest = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-19", targetTsb: 10, weekWeights: [0, 0, 0] },
      45,
    );
    expect(plan.total_load).toBeGreaterThan(0);
    // Resting three weeks overshoots +10, which is exactly why a plan is
    // worth solving: it keeps the fitness the rest would shed.
    expect(rest.achieved_tsb).toBeGreaterThan(plan.achieved_tsb - 0.001);
    expect(plan.days[20]!.ctl).toBeGreaterThan(rest.days[20]!.ctl);
  });

  it("honours caller-supplied week weights", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-12", targetTsb: 5, weekWeights: [1, 1] },
      40,
    );
    expect(plan.weeks[0]!.daily_load).toBeCloseTo(plan.weeks[1]!.daily_load, 1);
    expect(plan.achieved_tsb).toBeCloseTo(5, 1);
  });

  it("reports a target that even complete rest cannot reach", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-06-30", targetTsb: 25 },
      45,
    );
    expect(plan.feasible).toBe(false);
    expect(plan.note).toContain("complete rest");
    expect(plan.total_load).toBe(0);
    // Still reports where rest actually lands.
    expect(plan.achieved_tsb).toBeLessThan(25);
    expect(plan.achieved_tsb).toBeGreaterThan(plan.days[0]!.tsb - 100);
  });

  it("caps an absurdly negative target at the daily-load ceiling", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-07-01", targetTsb: -150 },
      45,
    );
    expect(plan.feasible).toBe(false);
    expect(plan.note).toContain(String(MAX_TAPER_DAILY_LOAD));
    expect(Math.max(...plan.days.map((d) => d.load))).toBeCloseTo(
      MAX_TAPER_DAILY_LOAD,
      1,
    );
    expect(plan.achieved_tsb).toBeGreaterThan(-150);
  });

  it("rejects a target date that is not in the future", () => {
    const plan = solveTaperPlan(
      start,
      "2026-06-28",
      { targetDate: "2026-06-28", targetTsb: 10 },
      45,
    );
    expect(plan.feasible).toBe(false);
    expect(plan.note).toContain("at least one day");
    expect(plan.weeks).toEqual([]);
    expect(plan.days).toEqual([]);
    expect(plan.achieved_tsb).toBe(-15);
  });

  it("omits pct_of_recent when there is no recent load to compare to", () => {
    const plan = solveTaperPlan(start, "2026-06-28", {
      targetDate: "2026-07-05",
      targetTsb: 0,
    });
    expect(plan.weeks[0]!.pct_of_recent).toBeNull();
    expect(plan.recent_daily_load).toBe(0);
  });

  it("comes through buildFitnessTrend with the recorded window as its start", () => {
    const acts = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 20));
      d.setUTCDate(d.getUTCDate() + i);
      return activity(d.toISOString().split("T")[0]!, 55);
    });
    const trend = buildFitnessTrend(acts, {
      endDate: "2026-06-28",
      days: 90,
      taper: { targetDate: "2026-07-12", targetTsb: 8 },
    });
    expect(trend.taper).not.toBeNull();
    expect(trend.taper!.achieved_tsb).toBeCloseTo(8, 1);
    expect(trend.taper!.days[0]!.date).toBe("2026-06-29");
    // The plan continues the recorded series, so it starts from its last day.
    const current = trend.current!;
    const first = trend.taper!.days[0]!;
    expect(Math.abs(first.ctl - current.ctl)).toBeLessThan(10);
    expect(trend.taper!.recent_daily_load).toBeGreaterThan(0);
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-06-28", "2026-07-05")).toBe(7);
    expect(daysBetween("2026-07-05", "2026-06-28")).toBe(-7);
    expect(daysBetween("2026-06-28", "2026-06-28")).toBe(0);
  });

  it("is unaffected by a DST boundary", () => {
    // Southern-hemisphere DST end, a UTC-safe arithmetic check.
    expect(daysBetween("2026-04-01", "2026-04-30")).toBe(29);
  });
});

describe("trendBands", () => {
  function day(date: string, tsb: number, ctl = 50): FitnessTrendDay {
    return { date, load: 0, ctl, atl: ctl - tsb, tsb };
  }

  it("dates a resolved deep-fatigue block the flags no longer raise", () => {
    const series = [
      day("2026-07-01", 0),
      ...Array.from({ length: DEEP_FATIGUE_DAYS }, (_, i) =>
        day(`2026-07-0${i + 2}`, DEEP_FATIGUE_TSB - 2),
      ),
      day("2026-07-08", 5),
    ];
    const bands = trendBands(series);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      kind: "deep-fatigue",
      start_date: "2026-07-02",
      end_date: "2026-07-06",
      days: DEEP_FATIGUE_DAYS,
    });
    // The chart still shades it; the flag list has moved on.
    expect(computeFlags(series)).toEqual([]);
  });

  it("ignores a deep dip shorter than the streak threshold", () => {
    const series = [
      day("2026-07-01", DEEP_FATIGUE_TSB - 1),
      day("2026-07-02", DEEP_FATIGUE_TSB - 1),
      day("2026-07-03", 0),
    ];
    expect(trendBands(series)).toEqual([]);
  });

  it("bands each fresh stretch separately", () => {
    const series = [
      day("2026-07-01", FRESH_TSB + 1),
      day("2026-07-02", 0),
      day("2026-07-03", FRESH_TSB),
      day("2026-07-04", FRESH_TSB + 4),
    ];
    const fresh = trendBands(series).filter((b) => b.kind === "fresh");
    expect(fresh.map((b) => [b.start_date, b.end_date])).toEqual([
      ["2026-07-01", "2026-07-01"],
      ["2026-07-03", "2026-07-04"],
    ]);
    // Reason quotes the band's own last day, not the series' last day.
    expect(fresh[0]!.reason).toContain(`TSB at ${FRESH_TSB + 1}`);
  });

  it("bands a steep CTL ramp and needs a week of runway first", () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      day(`2026-07-${String(i + 1).padStart(2, "0")}`, -5, 40 + i * 2),
    );
    const ramp = trendBands(series).filter((b) => b.kind === "steep-ramp");
    expect(ramp).toHaveLength(1);
    // Ramp needs day i-7, so the earliest possible band day is the 8th.
    expect(ramp[0]!.start_date).toBe("2026-07-08");
    expect(ramp[0]!.end_date).toBe("2026-07-12");
    expect(ramp[0]!.reason).toContain(
      `CTL climbed ${RAMP_RISK_PER_WEEK * 2.8}`,
    );
  });

  it("returns nothing for an empty series", () => {
    expect(trendBands([])).toEqual([]);
  });

  it("comes back from buildFitnessTrend alongside the flags", () => {
    const acts = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 6, 1));
      d.setUTCDate(d.getUTCDate() + i);
      return activity(d.toISOString().split("T")[0]!, 150);
    });
    const trend = buildFitnessTrend(acts, { endDate: "2026-07-21", days: 60 });
    expect(trend.bands.length).toBeGreaterThan(0);
    // Every flag is a band reason; bands may carry extra, older stretches.
    for (const flag of trend.flags) {
      expect(trend.bands.map((b) => b.reason)).toContain(flag);
    }
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
