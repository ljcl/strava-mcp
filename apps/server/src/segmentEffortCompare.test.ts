import { describe, expect, it } from "vitest";
import {
  compareEffortSlices,
  type EffortSlice,
  SegmentEffortCompareError,
  sliceEffort,
} from "./segmentEffortCompare";

/**
 * An effort covering `lengthM` at the given per-third paces (seconds per km),
 * sampled every 10 m, starting from a non-zero time and distance the way a real
 * slice out of an activity's streams does.
 */
function effort(
  lengthM: number,
  pacesSecPerKm: [number, number, number],
  options: { hr?: [number, number, number]; timeOffset?: number } = {},
): EffortSlice {
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  let t = options.timeOffset ?? 1000;
  const step = 10;
  for (let d = 0; d <= lengthM; d += step) {
    const third = Math.min(2, Math.floor((d / lengthM) * 3)) as 0 | 1 | 2;
    time.push(t);
    distance.push(5000 + d);
    if (options.hr) heartrate.push(options.hr[third]);
    t += (step / 1000) * pacesSecPerKm[third];
  }
  return {
    time,
    distance,
    ...(options.hr ? { heartrate } : {}),
  };
}

describe("compareEffortSlices", () => {
  it("normalises both efforts to a common origin", () => {
    const a = effort(900, [300, 300, 300], { timeOffset: 100 });
    const b = effort(900, [300, 300, 300], { timeOffset: 9999 });

    const comparison = compareEffortSlices(a, b);

    // 900 m at 300 s/km is 270 s for both, regardless of where in the
    // activity each effort sat.
    expect(comparison.totalSeconds[0]).toBeCloseTo(270, 0);
    expect(comparison.totalSeconds[1]).toBeCloseTo(270, 0);
    expect(comparison.totalDeltaSeconds).toBeCloseTo(0, 1);
  });

  it("locates a loss in the last third", () => {
    const a = effort(900, [300, 300, 300]);
    // Same first two thirds, 60 s/km slower on the last.
    const b = effort(900, [300, 300, 360]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.totalDeltaSeconds).toBeGreaterThan(15);
    const [first, middle, last] = comparison.thirds;
    expect(first?.deltaSeconds).toBeCloseTo(0, 0);
    expect(middle?.deltaSeconds).toBeCloseTo(0, 0);
    expect(last?.deltaSeconds).toBeGreaterThan(15);
  });

  it("locates a loss in the first third", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(900, [360, 300, 300]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.thirds[0]?.deltaSeconds).toBeGreaterThan(15);
    expect(comparison.thirds[2]?.deltaSeconds).toBeCloseTo(0, 0);
  });

  it("catches the went-out-too-hard shape: ahead early, behind overall", () => {
    const a = effort(900, [300, 300, 300]);
    // 30 s/km faster early, 90 s/km slower late.
    const b = effort(900, [270, 300, 390]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.thirds[0]?.deltaSeconds).toBeLessThan(0);
    expect(comparison.totalDeltaSeconds).toBeGreaterThan(0);
    // The peak advantage sits before the collapse.
    expect(comparison.bestForEffort2?.deltaSeconds).toBeLessThan(0);
    expect(comparison.bestForEffort2!.distanceM).toBeLessThan(
      comparison.worstForEffort2!.distanceM,
    );
  });

  it("reports per-third pace for both efforts", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(900, [300, 300, 360]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.thirds[0]?.paceSecPerKm[0]).toBeCloseTo(300, -1);
    expect(comparison.thirds[2]?.paceSecPerKm[1]).toBeCloseTo(360, -1);
  });

  it("reports per-third heart rate when both efforts recorded it", () => {
    const a = effort(900, [300, 300, 300], { hr: [150, 160, 170] });
    const b = effort(900, [300, 300, 300], { hr: [142, 152, 162] });

    const comparison = compareEffortSlices(a, b);

    expect(comparison.thirds[0]?.avgHr).toEqual([150, 142]);
    expect(comparison.thirds[2]?.avgHr).toEqual([170, 162]);
    expect(comparison.warnings.join(" ")).not.toContain("Heart rate");
  });

  it("warns when one effort has no heart rate", () => {
    const a = effort(900, [300, 300, 300], { hr: [150, 160, 170] });
    const b = effort(900, [300, 300, 300]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.thirds[0]?.avgHr[1]).toBeNull();
    expect(comparison.warnings.join(" ")).toContain("Heart rate is missing");
  });

  it("emits a cumulative delta curve that starts at zero", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(900, [300, 300, 360]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.deltaCurve[0]).toEqual({
      distanceM: 0,
      deltaSeconds: 0,
    });
    expect(comparison.deltaCurve).toHaveLength(21);
    // Monotonically non-decreasing: effort 2 never gains time back here.
    for (let i = 1; i < comparison.deltaCurve.length; i++) {
      expect(comparison.deltaCurve[i]!.deltaSeconds).toBeGreaterThanOrEqual(
        comparison.deltaCurve[i - 1]!.deltaSeconds - 0.01,
      );
    }
    expect(
      comparison.deltaCurve[comparison.deltaCurve.length - 1]?.deltaSeconds,
    ).toBeCloseTo(comparison.totalDeltaSeconds, 0);
  });

  it("honours a requested curve resolution", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(900, [310, 310, 310]);

    expect(
      compareEffortSlices(a, b, { curvePoints: 5 }).deltaCurve,
    ).toHaveLength(5);
  });

  it("compares only the distance both efforts share, and says so", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(700, [300, 300, 300]);

    const comparison = compareEffortSlices(a, b);

    expect(comparison.comparedDistanceM).toBe(700);
    expect(comparison.warnings.join(" ")).toContain("different distances");
  });

  it("stays quiet about a shortfall inside GPS noise", () => {
    const a = effort(900, [300, 300, 300]);
    const b = effort(890, [300, 300, 300]);

    expect(compareEffortSlices(a, b).warnings.join(" ")).not.toContain(
      "different distances",
    );
  });

  it("rejects an effort with too few samples", () => {
    expect(() =>
      compareEffortSlices(
        { time: [0], distance: [0] },
        effort(900, [300, 300, 300]),
      ),
    ).toThrow(SegmentEffortCompareError);
  });

  it("rejects misaligned streams", () => {
    expect(() =>
      compareEffortSlices(
        { time: [0, 1, 2], distance: [0, 10] },
        effort(900, [300, 300, 300]),
      ),
    ).toThrow(/misaligned/);
  });

  it("rejects efforts that recorded no distance", () => {
    const flat = { time: [0, 1, 2], distance: [500, 500, 500] };

    expect(() => compareEffortSlices(flat, flat)).toThrow(/any distance/);
  });
});

describe("sliceEffort", () => {
  const streams = {
    time: [0, 10, 20, 30, 40, 50],
    distance: [0, 100, 200, 300, 400, 500],
    heartrate: [140, 145, 150, 155, 160, 165],
  };

  it("slices the inclusive index window Strava reports", () => {
    const slice = sliceEffort(streams, 1, 3);

    expect(slice?.time).toEqual([10, 20, 30]);
    expect(slice?.distance).toEqual([100, 200, 300]);
    expect(slice?.heartrate).toEqual([145, 150, 155]);
  });

  it("clamps indices that run past the stream", () => {
    const slice = sliceEffort(streams, -5, 99);

    expect(slice?.time).toHaveLength(6);
  });

  it("drops a stream that does not align with time", () => {
    const slice = sliceEffort({ ...streams, heartrate: [1, 2] }, 0, 3);

    expect(slice?.heartrate).toBeUndefined();
    expect(slice?.time).toHaveLength(4);
  });

  it("returns null for a window with fewer than two samples", () => {
    expect(sliceEffort(streams, 2, 2)).toBeNull();
    expect(sliceEffort(streams, 4, 1)).toBeNull();
  });

  it("returns null when indices are absent", () => {
    expect(sliceEffort(streams, null, 3)).toBeNull();
    expect(sliceEffort(streams, 1, undefined)).toBeNull();
  });

  it("returns null without time or distance streams", () => {
    expect(sliceEffort({ distance: [0, 1] }, 0, 1)).toBeNull();
    expect(sliceEffort({ time: [0, 1] }, 0, 1)).toBeNull();
    expect(sliceEffort({ time: [0, 1], distance: [0] }, 0, 1)).toBeNull();
  });
});
