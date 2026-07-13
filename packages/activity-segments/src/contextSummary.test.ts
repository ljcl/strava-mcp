import { describe, expect, it } from "vitest";
import { buildSegmentsContextSummary } from "./contextSummary";
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

describe("buildSegmentsContextSummary", () => {
  it("returns null without an activity name", () => {
    expect(
      buildSegmentsContextSummary({
        activityName: null,
        segments: [row({})],
        expanded: [],
      }),
    ).toBeNull();
  });

  it("reports an empty activity without highlight or expansion noise", () => {
    expect(
      buildSegmentsContextSummary({
        activityName: "Recovery Jog",
        segments: [],
        expanded: [],
      }),
    ).toBe(
      'Viewing segment efforts for "Recovery Jog". No segments in this activity.',
    );
  });

  it("covers counts, highlights, and the no-expansion state", () => {
    const pr = row({ segmentId: "pr", name: "Hill Sprint", prRank: 1 });
    const top10 = row({ segmentId: "kom", name: "River Loop", komRank: 3 });
    const plain = row({ segmentId: "plain", name: "Flat Mile" });

    expect(
      buildSegmentsContextSummary({
        activityName: "Morning Run",
        segments: [plain, top10, pr],
        expanded: [],
      }),
    ).toBe(
      'Viewing segment efforts for "Morning Run". 3 segments, 1 PR, 1 top-10. ' +
        "Highlights: Hill Sprint (PR 1), River Loop (top 3). " +
        "No efforts expanded.",
    );
  });

  it("lists expanded efforts with their elapsed time", () => {
    const a = row({ segmentId: "a", name: "Hill Sprint", elapsedTime: 272 });

    const text = buildSegmentsContextSummary({
      activityName: "Morning Run",
      segments: [a, row({ segmentId: "b" })],
      expanded: [a],
    });

    expect(text).toContain("Expanded: Hill Sprint (4:32).");
    expect(text).not.toContain("No efforts expanded");
  });

  it("caps long name lists and counts the overflow", () => {
    const prs = [1, 2, 3, 4, 5].map((n) =>
      row({ segmentId: `s${n}`, name: `Seg ${n}`, prRank: 1 }),
    );

    const text = buildSegmentsContextSummary({
      activityName: "Segment Hunt",
      segments: prs,
      expanded: prs,
    });

    expect(text).toContain(
      "Highlights: Seg 1 (PR 1), Seg 2 (PR 1), Seg 3 (PR 1), and 2 more.",
    );
    expect(text).toContain(
      "Expanded: Seg 1 (5:00), Seg 2 (5:00), Seg 3 (5:00), and 2 more.",
    );
  });
});
