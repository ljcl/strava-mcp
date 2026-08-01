import { describe, expect, it } from "vitest";
import { buildRowLabel, buildSegmentsA11ySummary, heatBand } from "./a11y";
import { buildHeatDomain } from "./segments";
import { type SegmentEffortRow } from "./types";

/** An effort with just the fields the narration reads. */
function effort(over: Partial<SegmentEffortRow> = {}): SegmentEffortRow {
  return {
    segmentId: "1",
    name: "Test Segment",
    elapsedTime: 300,
    movingTime: 300,
    distanceMeters: 1000,
    averageGrade: 0,
    maxGrade: 0,
    prRank: null,
    komRank: null,
    startIndex: 0,
    endIndex: 100,
    averageHeartrate: null,
    maxHeartrate: null,
    averageCadence: null,
    averageWatts: null,
    deviceWatts: false,
    ...over,
  } as SegmentEffortRow;
}

/** Three efforts spanning a real speed range. */
const spread = [
  effort({ segmentId: "1", name: "Quick", elapsedTime: 100 }),
  effort({ segmentId: "2", name: "Middling", elapsedTime: 200 }),
  effort({ segmentId: "3", name: "Slow", elapsedTime: 400 }),
];

describe("heatBand", () => {
  it("puts the fastest and slowest efforts at the ends", () => {
    const domain = buildHeatDomain(spread);
    expect(heatBand(spread[0]!, domain)).toBe("fastest");
    expect(heatBand(spread[2]!, domain)).toBe("slowest");
  });

  it("calls everything average when there is no spread to rank within", () => {
    const same = [effort({ segmentId: "1" }), effort({ segmentId: "2" })];
    const domain = buildHeatDomain(same);
    // One effort, or a set that all took the same speed, has no ranking —
    // calling one of them "the fastest" would be an invention.
    expect(heatBand(same[0]!, domain)).toBe("middle");
  });
});

describe("buildRowLabel", () => {
  it("states the name, time, pace, and where the dot sits", () => {
    const domain = buildHeatDomain(spread);
    const label = buildRowLabel(spread[0]!, domain, "Run");

    expect(label).toContain("Quick");
    expect(label).toContain("1:40");
    expect(label).toContain("/km");
    // The dot's colour is the row's primary encoding and is otherwise mute.
    expect(label).toContain("among the fastest");
  });

  it("names a PR rather than leaving it to the badge colour", () => {
    const domain = buildHeatDomain(spread);
    const label = buildRowLabel(
      effort({ name: "Hill", prRank: 1 }),
      domain,
      "Run",
    );
    expect(label).toContain("personal best");
  });

  it("names a top-10 placing", () => {
    const domain = buildHeatDomain(spread);
    const label = buildRowLabel(
      effort({ name: "Hill", komRank: 8 }),
      domain,
      "Run",
    );
    expect(label).toContain("top 8 all time");
  });

  it("omits pace for an effort slower than a walk", () => {
    const paused = effort({ elapsedTime: 100000, distanceMeters: 10 });
    const label = buildRowLabel(paused, buildHeatDomain([paused]), "Run");
    expect(label).not.toContain("/km");
  });

  it("reads speed for a ride, not pace", () => {
    const domain = buildHeatDomain(spread);
    expect(buildRowLabel(spread[0]!, domain, "Ride")).toContain("km/h");
  });
});

describe("buildSegmentsA11ySummary", () => {
  it("counts the segments and the achievements", () => {
    const efforts = [
      effort({ segmentId: "1", prRank: 1 }),
      effort({ segmentId: "2", komRank: 5 }),
      effort({ segmentId: "3", elapsedTime: 100 }),
    ];
    const summary = buildSegmentsA11ySummary(
      efforts,
      buildHeatDomain(efforts),
      "Run",
    );

    expect(summary).toContain("3 segments");
    expect(summary).toContain("1 personal best");
    expect(summary).toContain("1 in the all-time top 10");
  });

  it("names the fastest and slowest", () => {
    const summary = buildSegmentsA11ySummary(
      spread,
      buildHeatDomain(spread),
      "Run",
    );
    expect(summary).toContain("Fastest was Quick");
    expect(summary).toContain("slowest was Slow");
  });

  it("explains the colour encoding, which is otherwise silent", () => {
    const summary = buildSegmentsA11ySummary(
      spread,
      buildHeatDomain(spread),
      "Run",
    );
    expect(summary).toContain("colour");
  });

  it("says nothing about fastest and slowest for a single effort", () => {
    const one = [effort()];
    const summary = buildSegmentsA11ySummary(one, buildHeatDomain(one), "Run");
    expect(summary).toContain("1 segment");
    expect(summary).not.toContain("Fastest was");
  });

  it("handles an empty activity", () => {
    expect(buildSegmentsA11ySummary([], { min: 0, max: 0 }, "Run")).toBe(
      "No segments in this activity.",
    );
  });
});
