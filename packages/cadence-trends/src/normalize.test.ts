import { describe, expect, it } from "vitest";
import { resampleOverlayRuns } from "./normalize";
import { type OverlayPoint } from "./types";

/** Evenly spaced points: `count` samples covering 0..maxDistance km / 0..maxTime min. */
function makePoints(
  count: number,
  maxDistance: number,
  maxTime: number,
  cadence: (i: number) => number | undefined,
): OverlayPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    distance: (maxDistance * i) / (count - 1),
    time: (maxTime * i) / (count - 1),
    cadence: cadence(i),
  }));
}

describe("resampleOverlayRuns", () => {
  it("returns an empty dataset when no run has cadence", () => {
    const rows = resampleOverlayRuns(
      [{ id: 1, points: makePoints(5, 10, 60, () => undefined) }],
      "distance",
    );
    expect(rows).toEqual([]);
  });

  // Regression for #110: the old index merge plotted every run's cadence
  // against the last-iterated run's x values, misaligning runs at
  // different speeds.
  it("keeps each run aligned to its own x values on the shared grid", () => {
    // Fast run: 10 km in 11 points; slow run: 5 km over the same 11 indices.
    // Constant cadences make any misalignment show up as a wrong value.
    const fast = { id: 1, points: makePoints(11, 10, 40, () => 180) };
    const slow = { id: 2, points: makePoints(11, 5, 40, () => 160) };

    const rows = resampleOverlayRuns([fast, slow], "distance", 10);

    // At 4 km both runs are mid-flight and keep their own cadence.
    const at4km = rows.find((r) => Math.abs((r.x ?? 0) - 4) < 1e-9)!;
    expect(at4km.cadence_1).toBeCloseTo(180);
    expect(at4km.cadence_2).toBeCloseTo(160);
  });

  it("interpolates linearly between samples", () => {
    // Cadence ramps 100 -> 200 over 0..10 km.
    const run = {
      id: 7,
      points: makePoints(11, 10, 60, (i) => 100 + i * 10),
    };

    const rows = resampleOverlayRuns([run], "distance", 20);

    const at2500m = rows.find((r) => Math.abs((r.x ?? 0) - 2.5) < 1e-9)!;
    expect(at2500m.cadence_7).toBeCloseTo(125);
  });

  // Regression for #110: past a shorter run's end the old merge clamped to
  // its final point, fabricating a flat tail out to the longest run.
  it("leaves shorter runs undefined past their own extent", () => {
    const long = { id: 1, points: makePoints(11, 10, 60, () => 180) };
    const short = { id: 2, points: makePoints(11, 5, 30, () => 170) };

    const rows = resampleOverlayRuns([long, short], "distance", 10);

    const beyondShort = rows.filter((r) => (r.x ?? 0) > 5);
    expect(beyondShort.length).toBeGreaterThan(0);
    for (const row of beyondShort) {
      expect(row.cadence_2).toBeUndefined();
      expect(row.cadence_1).toBeCloseTo(180);
    }
  });

  it("uses time for the x axis in time mode", () => {
    const run = { id: 3, points: makePoints(11, 10, 50, () => 175) };

    const rows = resampleOverlayRuns([run], "time", 10);

    expect(rows[0]!.x).toBeCloseTo(0);
    expect(rows[rows.length - 1]!.x).toBeCloseTo(50);
    expect(rows.every((r) => r.cadence_3 !== undefined)).toBe(true);
  });

  it("skips samples without cadence instead of plotting gaps as zero", () => {
    // Middle sample missing: interpolation bridges its neighbours.
    const run = {
      id: 4,
      points: makePoints(5, 4, 20, (i) => (i === 2 ? undefined : 150)),
    };

    const rows = resampleOverlayRuns([run], "distance", 8);

    const at2km = rows.find((r) => Math.abs((r.x ?? 0) - 2) < 1e-9)!;
    expect(at2km.cadence_4).toBeCloseTo(150);
  });
});
