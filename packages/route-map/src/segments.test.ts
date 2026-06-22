import { describe, expect, it } from "vitest";
import {
  formatSegmentDistance,
  type RouteSegment,
  segmentsAtIndex,
  selectOutlineSegments,
} from "./segments";

function seg(over: Partial<RouteSegment> & { name: string }): RouteSegment {
  return {
    startIndex: 0,
    endIndex: 10,
    isPr: false,
    isTop10: false,
    distanceMeters: 500,
    ...over,
  };
}

describe("selectOutlineSegments", () => {
  it("keeps every notable effort regardless of length", () => {
    const segments = [
      seg({
        name: "short pr",
        startIndex: 0,
        endIndex: 2,
        isPr: true,
        distanceMeters: 50,
      }),
      seg({
        name: "short top10",
        startIndex: 3,
        endIndex: 5,
        isTop10: true,
        distanceMeters: 60,
      }),
    ];
    const out = selectOutlineSegments(segments, 0);
    expect(out.map((s) => s.name)).toEqual(["short pr", "short top10"]);
  });

  it("adds only the longest N non-notable efforts", () => {
    const segments = [
      seg({ name: "long", distanceMeters: 900 }),
      seg({ name: "mid", distanceMeters: 500 }),
      seg({ name: "tiny", distanceMeters: 80 }),
    ];
    const out = selectOutlineSegments(segments, 2);
    expect(out.map((s) => s.name)).toEqual(["long", "mid"]);
    expect(out.map((s) => s.name)).not.toContain("tiny");
  });

  it("preserves input order in the result", () => {
    const segments = [
      seg({ name: "a", startIndex: 0, distanceMeters: 100 }),
      seg({ name: "b", startIndex: 5, distanceMeters: 900 }),
      seg({ name: "c", startIndex: 9, isPr: true, distanceMeters: 50 }),
    ];
    const out = selectOutlineSegments(segments, 1);
    expect(out.map((s) => s.name)).toEqual(["b", "c"]);
  });

  it("returns all when there are fewer non-notable than the extra budget", () => {
    const segments = [seg({ name: "only", distanceMeters: 200 })];
    expect(selectOutlineSegments(segments, 4)).toHaveLength(1);
  });
});

describe("segmentsAtIndex", () => {
  const segments = [
    seg({
      name: "big loop",
      startIndex: 0,
      endIndex: 100,
      distanceMeters: 5000,
    }),
    seg({ name: "mid", startIndex: 40, endIndex: 80, distanceMeters: 1200 }),
    seg({
      name: "mini pr",
      startIndex: 48,
      endIndex: 52,
      isPr: true,
      distanceMeters: 120,
    }),
  ];

  it("returns every segment covering the index", () => {
    expect(segmentsAtIndex(segments, 50).map((s) => s.name)).toEqual([
      "mini pr",
      "mid",
      "big loop",
    ]);
  });

  it("orders notable first, then shortest span", () => {
    const out = segmentsAtIndex(segments, 50);
    expect(out[0]?.name).toBe("mini pr"); // PR leads
    expect(out[1]?.name).toBe("mid"); // shorter span than the big loop
  });

  it("includes the boundary indices (inclusive span)", () => {
    expect(segmentsAtIndex(segments, 0).map((s) => s.name)).toEqual([
      "big loop",
    ]);
    expect(segmentsAtIndex(segments, 100).map((s) => s.name)).toEqual([
      "big loop",
    ]);
  });

  it("is empty off any span or with a null index", () => {
    expect(segmentsAtIndex(segments, 200)).toEqual([]);
    expect(segmentsAtIndex(segments, null)).toEqual([]);
  });
});

describe("formatSegmentDistance", () => {
  it("uses metres under a kilometre", () => {
    expect(formatSegmentDistance(80)).toBe("80 m");
    expect(formatSegmentDistance(999)).toBe("999 m");
  });

  it("uses kilometres at and above 1000 m", () => {
    expect(formatSegmentDistance(1000)).toBe("1.0 km");
    expect(formatSegmentDistance(5230)).toBe("5.2 km");
  });
});
