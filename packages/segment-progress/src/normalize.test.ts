import { describe, expect, it } from "vitest";
import {
  mockEfforts,
  mockSegment,
  mockSegmentProgressData,
  sparseEfforts,
  sparseSegmentProgressData,
} from "./__fixtures__/efforts";
import {
  buildChartRows,
  buildSegmentSubtitle,
  buildSummaryStats,
  cadenceUnit,
  formatEffortSpeed,
  formatSecondsDelta,
  hasHeartrate,
  highlightForRank,
  newestFirst,
  spansMultipleYears,
} from "./normalize";

describe("formatSecondsDelta", () => {
  it("signs both directions and names a zero delta", () => {
    expect(formatSecondsDelta(-6)).toBe("-6s");
    expect(formatSecondsDelta(12)).toBe("+12s");
    expect(formatSecondsDelta(0)).toBe("same");
  });
});

describe("formatEffortSpeed", () => {
  it("renders pace for run segments", () => {
    expect(formatEffortSpeed(250, "Run")).toBe(`4'10" /km`);
  });

  it("renders speed for ride segments", () => {
    expect(formatEffortSpeed(120, "Ride")).toBe("30.0 km/h");
  });

  it("falls back to pace when the sport is unknown", () => {
    expect(formatEffortSpeed(300, null)).toBe(`5'00" /km`);
  });

  it("returns a dash when there is no usable pace", () => {
    expect(formatEffortSpeed(null, "Run")).toBe("—");
    expect(formatEffortSpeed(0, "Run")).toBe("—");
  });
});

describe("cadenceUnit", () => {
  it("uses steps for runs and revolutions for everything else", () => {
    expect(cadenceUnit("Run")).toBe("spm");
    expect(cadenceUnit("TrailRun")).toBe("spm");
    expect(cadenceUnit("Ride")).toBe("rpm");
  });

  it("assumes running when the sport is unknown", () => {
    expect(cadenceUnit(null)).toBe("spm");
  });
});

describe("spansMultipleYears", () => {
  it("is true when the history crosses new-year", () => {
    expect(spansMultipleYears(mockEfforts)).toBe(true);
  });

  it("is false within one year and for no efforts", () => {
    expect(spansMultipleYears(sparseEfforts)).toBe(false);
    expect(spansMultipleYears([])).toBe(false);
  });
});

describe("highlightForRank", () => {
  it("tiers the top three and leaves the rest plain", () => {
    expect(highlightForRank(1, 8)).toBe("best");
    expect(highlightForRank(2, 8)).toBe("top");
    expect(highlightForRank(3, 8)).toBe("top");
    expect(highlightForRank(4, 8)).toBeNull();
  });

  it("marks only the best when a top three would cover everything", () => {
    expect(highlightForRank(1, 3)).toBe("best");
    expect(highlightForRank(2, 3)).toBeNull();
    expect(highlightForRank(3, 3)).toBeNull();
  });
});

describe("buildChartRows", () => {
  it("keeps chronological order and labels with the year when needed", () => {
    const rows = buildChartRows(mockEfforts);

    expect(rows).toHaveLength(mockEfforts.length);
    expect(rows[0]?.label).toBe("14 Sep 25");
    expect(rows[rows.length - 1]?.label).toBe("26 Apr 26");
  });

  it("highlights the fastest effort as best and ranks 2–3 as top three", () => {
    const rows = buildChartRows(mockEfforts);
    const best = rows.filter((row) => row.highlight === "best");
    const top = rows.filter((row) => row.highlight === "top");

    expect(best).toHaveLength(1);
    expect(best[0]?.rank).toBe(1);
    expect(best[0]?.elapsedSeconds).toBe(244);
    expect(top.map((row) => row.rank).sort()).toEqual([2, 3]);
    expect(rows.filter((row) => row.highlight === null)).toHaveLength(5);
  });

  it("highlights only the best in a three-effort history", () => {
    const rows = buildChartRows(sparseEfforts);

    expect(rows.filter((row) => row.highlight === "best")).toHaveLength(1);
    expect(rows.filter((row) => row.highlight === "top")).toHaveLength(0);
  });

  it("only forwards power measured by a meter", () => {
    const [estimated, measured] = buildChartRows([
      { ...mockEfforts[0]!, averageWatts: 280, deviceWatts: false },
      { ...mockEfforts[1]!, averageWatts: 295, deviceWatts: true },
    ]);

    expect(estimated?.averageWatts).toBeNull();
    expect(measured?.averageWatts).toBe(295);
  });

  it("returns no rows for an empty history", () => {
    expect(buildChartRows([])).toEqual([]);
  });
});

describe("newestFirst", () => {
  it("reverses without mutating the source", () => {
    const listed = newestFirst(mockEfforts);

    expect(listed[0]?.date).toBe("2026-04-26T07:18:00Z");
    expect(mockEfforts[0]?.date).toBe("2025-09-14T07:12:00Z");
  });
});

describe("hasHeartrate", () => {
  it("detects any effort carrying heart rate", () => {
    expect(hasHeartrate(mockEfforts)).toBe(true);
    expect(hasHeartrate(sparseEfforts)).toBe(false);
  });
});

describe("buildSummaryStats", () => {
  it("shows time and heart-rate trends as improvements when they fall", () => {
    const stats = buildSummaryStats(mockSegmentProgressData.summary);

    expect(stats).toEqual([
      { label: "Efforts", value: "8" },
      { label: "Best", value: "4:04" },
      { label: "Latest", value: "4:09" },
      { label: "Time trend", value: "-13s", direction: "up" },
      { label: "HR trend", value: "-8 bpm", direction: "up" },
    ]);
  });

  it("marks a slower recent half as a regression", () => {
    const stats = buildSummaryStats({
      ...mockSegmentProgressData.summary,
      avgSecondsDelta: 7,
      avgHeartrateDelta: 0,
    });

    expect(stats).toContainEqual({
      label: "Time trend",
      value: "+7s",
      direction: "down",
    });
    expect(stats).toContainEqual({
      label: "HR trend",
      value: "same",
      direction: "flat",
    });
  });

  it("falls back to the gap against the best below four efforts", () => {
    const stats = buildSummaryStats(sparseSegmentProgressData.summary);

    expect(stats).toContainEqual({
      label: "vs best",
      value: "+4s",
      direction: "flat",
    });
    expect(stats.some((stat) => stat.label === "HR trend")).toBe(false);
  });

  it("reports only the effort count for an empty history", () => {
    const stats = buildSummaryStats({
      ...sparseSegmentProgressData.summary,
      effortCount: 0,
      bestSeconds: null,
      latestSeconds: null,
      latestVsBestSeconds: null,
    });

    expect(stats).toEqual([{ label: "Efforts", value: "0" }]);
  });
});

describe("buildSegmentSubtitle", () => {
  it("lists distance, grade, climb category, and place", () => {
    expect(buildSegmentSubtitle(mockSegment)).toBe(
      "820 m · 5.4% avg · Cat 3 · Mosman",
    );
  });

  it("omits an uncategorised climb and falls back through the place fields", () => {
    expect(
      buildSegmentSubtitle({
        ...mockSegment,
        climbCategory: 0,
        city: null,
        state: null,
      }),
    ).toBe("820 m · 5.4% avg · Australia");
  });

  it("drops missing fields entirely", () => {
    expect(
      buildSegmentSubtitle({
        ...mockSegment,
        averageGrade: null,
        climbCategory: null,
        city: null,
        state: null,
        country: null,
      }),
    ).toBe("820 m");
  });
});
