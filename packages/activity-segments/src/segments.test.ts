import { describe, expect, it } from "vitest";
import {
  effortKey,
  effortSpeed,
  formatClock,
  formatEffortPace,
  runOrder,
  selectHighlights,
  summaryCounts,
  summaryLine,
} from "./segments";
import { type SegmentEffortRow } from "./types";

function row(partial: Partial<SegmentEffortRow>): SegmentEffortRow {
  return {
    name: "Segment",
    segmentId: "1",
    distanceMeters: 1000,
    elapsedTime: 300,
    movingTime: 300,
    averageGrade: 0,
    maximumGrade: 0,
    climbCategory: null,
    prRank: null,
    komRank: null,
    averageHeartrate: null,
    maxHeartrate: null,
    averageWatts: null,
    deviceWatts: null,
    averageCadence: null,
    startIndex: 0,
    ...partial,
  };
}

describe("selectHighlights", () => {
  it("keeps only PR/top-10 rows, PR-first, rank 1 before rank 2", () => {
    const pr1 = row({ segmentId: "pr1", prRank: 1, startIndex: 30 });
    const pr2 = row({ segmentId: "pr2", prRank: 2, startIndex: 10 });
    const top10 = row({ segmentId: "kom", komRank: 5, startIndex: 5 });
    const none = row({ segmentId: "none", startIndex: 0 });

    const result = selectHighlights([none, top10, pr2, pr1]);

    expect(result.map((e) => e.segmentId)).toEqual(["pr1", "pr2", "kom"]);
    expect(result.some((e) => e.segmentId === "none")).toBe(false);
  });

  it("sorts a PR row before a top-10-only row", () => {
    const prOnly = row({ segmentId: "pr", prRank: 3 });
    const komOnly = row({ segmentId: "kom", komRank: 1 });

    const result = selectHighlights([komOnly, prOnly]);

    expect(result[0]?.segmentId).toBe("pr");
  });
});

describe("runOrder", () => {
  it("sorts ascending by startIndex, null sinks last", () => {
    const a = row({ segmentId: "a", startIndex: 200 });
    const b = row({ segmentId: "b", startIndex: 10 });
    const c = row({ segmentId: "c", startIndex: null });
    const d = row({ segmentId: "d", startIndex: 50 });

    const result = runOrder([a, b, c, d]);

    expect(result.map((e) => e.segmentId)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("summaryCounts", () => {
  it("counts total, prs, and top10 on a mixed set", () => {
    const efforts = [
      row({ prRank: 1, komRank: 2 }),
      row({ prRank: 1 }),
      row({ komRank: 4 }),
      row({}),
    ];

    expect(summaryCounts(efforts)).toEqual({ total: 4, prs: 2, top10: 2 });
  });
});

describe("formatEffortPace", () => {
  it("formats a run as pace with /km", () => {
    // 1000 m in 300 s = 3.333 m/s -> 5'00" /km
    const result = formatEffortPace(row({}), "Run");
    expect(result).toContain("/km");
    expect(result).toBe("5'00\" /km");
  });

  it("formats a ride as km/h", () => {
    // 1000 m in 100 s = 10 m/s -> 36.0 km/h
    const result = formatEffortPace(
      row({ distanceMeters: 1000, elapsedTime: 100 }),
      "Ride",
    );
    expect(result).toBe("36.0 km/h");
  });

  it("returns — for a near-zero-distance (paused) row", () => {
    const result = formatEffortPace(
      row({ distanceMeters: 1, elapsedTime: 300 }),
      "Run",
    );
    expect(result).toBe("—");
  });
});

describe("formatClock", () => {
  it("formats sub-minute as m:ss", () => {
    expect(formatClock(24)).toBe("0:24");
  });

  it("formats sub-hour as m:ss", () => {
    expect(formatClock(770)).toBe("12:50");
  });

  it("formats over an hour as h:mm:ss", () => {
    expect(formatClock(3924)).toBe("1:05:24");
  });
});

describe("effortSpeed", () => {
  it("returns 0 when elapsedTime is 0 (no NaN/Infinity)", () => {
    const result = effortSpeed(row({ elapsedTime: 0 }));
    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("summaryLine", () => {
  it("omits zero tiers", () => {
    expect(summaryLine([row({})])).toBe("1 segment");
  });

  it("pluralizes and includes both tiers", () => {
    const efforts = [
      row({ segmentId: "a", prRank: 1 }),
      row({ segmentId: "b", prRank: 2 }),
      row({ segmentId: "c", komRank: 4 }),
    ];
    expect(summaryLine(efforts)).toBe("3 segments, 2 PRs, 1 top-10");
  });
});

describe("effortKey", () => {
  it("disambiguates repeat efforts on the same segment by startIndex", () => {
    const first = effortKey(row({ segmentId: "9", startIndex: 10 }));
    const second = effortKey(row({ segmentId: "9", startIndex: 900 }));
    expect(first).not.toBe(second);
  });

  it("falls back to a stable key when startIndex is null", () => {
    expect(effortKey(row({ segmentId: "9", startIndex: null }))).toBe("9-x");
  });
});
