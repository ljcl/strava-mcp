import { describe, expect, it } from "vitest";
import {
  buildGradientBands,
  chooseBandLength,
  computeGradientProfile,
  describeShape,
  type GradientBand,
  GradientProfileError,
  steepestWindow,
} from "./gradientProfile";

/**
 * Synthesise a distance + altitude pair from a list of `[lengthM, gradePct]`
 * pitches, sampled every `stepM` metres — the shape a segment's or route's
 * stored streams arrive in.
 */
function course(
  pitches: Array<[number, number]>,
  stepM = 10,
): { distance: number[]; altitude: number[] } {
  const distance = [0];
  const altitude = [100];
  for (const [lengthM, gradePct] of pitches) {
    const steps = Math.round(lengthM / stepM);
    for (let i = 0; i < steps; i++) {
      distance.push(distance[distance.length - 1]! + stepM);
      altitude.push(altitude[altitude.length - 1]! + (stepM * gradePct) / 100);
    }
  }
  return { distance, altitude };
}

const band = (
  startM: number,
  lengthM: number,
  elevationChangeM: number,
): GradientBand => ({
  startM,
  endM: startM + lengthM,
  lengthM,
  gradePct: (elevationChangeM / lengthM) * 100,
  elevationChangeM,
});

describe("chooseBandLength", () => {
  it("keeps short segments fine-grained and long routes readable", () => {
    expect(chooseBandLength(600)).toBe(100);
    expect(chooseBandLength(3000)).toBe(100);
    expect(chooseBandLength(5000)).toBe(250);
    expect(chooseBandLength(15000)).toBe(500);
    expect(chooseBandLength(42195)).toBe(1000);
  });
});

describe("buildGradientBands", () => {
  it("reports each band's own grade, not the course average", () => {
    // 500 m flat then 500 m at 10% — the average grade is 5%, which is the
    // number a profile exists to disagree with.
    const { distance, altitude } = course([
      [500, 0],
      [500, 10],
    ]);

    const bands = buildGradientBands(distance, altitude, 100);

    expect(bands).toHaveLength(10);
    expect(bands.slice(0, 5).map((b) => b.gradePct)).toEqual([0, 0, 0, 0, 0]);
    for (const steep of bands.slice(5)) {
      expect(steep.gradePct).toBeCloseTo(10, 5);
    }
  });

  it("merges a trailing sliver into the band before it", () => {
    const { distance, altitude } = course([[630, 5]]);

    const bands = buildGradientBands(distance, altitude, 100);

    // Six full bands and a 30 m remnant would be seven; the remnant merges.
    expect(bands).toHaveLength(6);
    expect(bands[bands.length - 1]?.lengthM).toBe(130);
    expect(bands[bands.length - 1]?.endM).toBe(630);
  });

  it("keeps a substantial final band separate", () => {
    const { distance, altitude } = course([[680, 5]]);

    const bands = buildGradientBands(distance, altitude, 100);

    expect(bands).toHaveLength(7);
    expect(bands[6]?.lengthM).toBe(80);
  });

  it("returns nothing for a course that does not advance", () => {
    expect(buildGradientBands([0, 0, 0], [1, 2, 3], 100)).toEqual([]);
  });
});

describe("steepestWindow", () => {
  it("finds the wall rather than the average", () => {
    const { distance, altitude } = course([
      [1000, 0],
      [200, 12],
      [400, 1],
    ]);

    const crux = steepestWindow(distance, altitude, 200);

    expect(crux).not.toBeNull();
    expect(crux?.gradePct).toBeCloseTo(12, 1);
    expect(crux?.startM).toBe(1000);
    expect(crux?.lengthM).toBe(200);
  });

  it("places the crux as a fraction of the course", () => {
    const { distance, altitude } = course([
      [800, 0],
      [200, 15],
      [1000, 0],
    ]);

    // Midpoint of the 800–1000 m wall over a 2000 m course.
    expect(
      steepestWindow(distance, altitude, 200)?.positionFraction,
    ).toBeCloseTo(0.45, 2);
  });

  it("shrinks the window on a course shorter than it", () => {
    const { distance, altitude } = course([[300, 8]]);

    const crux = steepestWindow(distance, altitude, 200);

    expect(crux?.lengthM).toBe(150);
    expect(crux?.gradePct).toBeCloseTo(8, 5);
  });

  it("reports no crux on a course that only descends", () => {
    const { distance, altitude } = course([[1000, -5]]);

    expect(steepestWindow(distance, altitude, 200)).toBeNull();
  });
});

describe("describeShape", () => {
  it("calls a course with no relief flat", () => {
    expect(describeShape([band(0, 500, 1), band(500, 500, -1)], 0)).toBe(
      "flat",
    );
  });

  it("calls a net descent descending", () => {
    expect(describeShape([band(0, 1000, -60)], -6)).toBe("descending");
  });

  it("calls real ups and downs rolling, not steady", () => {
    // Net +20 m, but 40 m of descent inside it: the average grade is netting
    // out relief rather than describing one slope.
    const bands = [band(0, 500, 30), band(500, 500, -40), band(1000, 500, 30)];
    expect(describeShape(bands, 1.3)).toBe("rolling");
  });

  it("calls an even climb steady", () => {
    const bands = [band(0, 500, 20), band(500, 500, 20), band(1000, 500, 20)];
    expect(describeShape(bands, 4)).toBe("steady");
  });

  it("calls a climb that front-loads its gain front-loaded", () => {
    const bands = [band(0, 500, 50), band(500, 500, 5), band(1000, 500, 5)];
    expect(describeShape(bands, 4)).toBe("front-loaded");
  });

  it("calls a wall at the end back-loaded", () => {
    const bands = [band(0, 500, 5), band(500, 500, 5), band(1000, 500, 50)];
    expect(describeShape(bands, 4)).toBe("back-loaded");
  });
});

describe("computeGradientProfile", () => {
  it("profiles a flat kilometre followed by a wall", () => {
    const { distance, altitude } = course([
      [1000, 0],
      [500, 12],
    ]);

    const profile = computeGradientProfile({ distance, altitude });

    expect(profile.lengthM).toBe(1500);
    expect(profile.avgGradePct).toBeCloseTo(4, 1);
    expect(profile.shape).toBe("back-loaded");
    expect(profile.steepest?.gradePct).toBeCloseTo(12, 1);
    // The crux sits in the last third, which is the whole point.
    expect(profile.steepest?.positionFraction).toBeGreaterThan(0.66);
    expect(profile.climbs).toHaveLength(1);
    expect(profile.climbs[0]?.gradePct).toBeCloseTo(12, 1);
    expect(profile.elevationGainM).toBeCloseTo(60, 0);
    expect(profile.elevationLossM).toBe(0);
  });

  it("profiles a steady ramp of the same average differently", () => {
    const { distance, altitude } = course([[1500, 4]]);

    const profile = computeGradientProfile({ distance, altitude });

    expect(profile.avgGradePct).toBeCloseTo(4, 1);
    expect(profile.shape).toBe("steady");
    expect(profile.steepest?.gradePct).toBeCloseTo(4, 1);
  });

  it("picks a band length from the course length", () => {
    const { distance, altitude } = course([[600, 3]], 10);

    expect(computeGradientProfile({ distance, altitude }).bandLengthM).toBe(
      100,
    );
    expect(
      computeGradientProfile({ distance, altitude }, { bandLengthM: 200 })
        .bandLengthM,
    ).toBe(200);
  });

  it("records min and max altitude", () => {
    const { distance, altitude } = course([
      [500, 10],
      [500, -10],
    ]);

    const profile = computeGradientProfile({ distance, altitude });

    expect(profile.minAltitudeM).toBeCloseTo(100, 0);
    expect(profile.maxAltitudeM).toBeCloseTo(150, 0);
    expect(profile.netElevationChangeM).toBeCloseTo(0, 1);
  });

  it("warns when grade had to be derived from elevation", () => {
    const { distance, altitude } = course([[500, 5]]);

    expect(computeGradientProfile({ distance, altitude }).warnings).toContain(
      "No smoothed-grade stream; grade was derived from the elevation stream.",
    );
  });

  it("does not warn when a smoothed-grade stream is present", () => {
    const { distance, altitude } = course([[500, 5]]);
    const grade_smooth = distance.map(() => 5);

    const profile = computeGradientProfile({
      distance,
      altitude,
      grade_smooth,
    });

    expect(profile.warnings).toEqual([]);
  });

  it("warns when gain arrives in pitches too short to detect", () => {
    // 100 m pitches at 8%, each separated by a descent longer than the
    // detector's 150 m grace distance, so no candidate survives the 200 m
    // minimum length — real elevation gain, no sustained climb.
    const { distance, altitude } = course([
      [100, 8],
      [200, -4],
      [100, 8],
      [200, -4],
      [100, 8],
      [200, -4],
    ]);

    const profile = computeGradientProfile({ distance, altitude });

    expect(profile.climbs).toEqual([]);
    expect(profile.warnings.join(" ")).toContain("No sustained climb detected");
  });

  it("rejects a course with no elevation stream", () => {
    expect(() =>
      computeGradientProfile({ distance: [0, 100], altitude: [] }),
    ).toThrow(GradientProfileError);
  });

  it("rejects a misaligned elevation stream", () => {
    expect(() =>
      computeGradientProfile({ distance: [0, 100, 200], altitude: [1, 2] }),
    ).toThrow(/aligned/);
  });

  it("rejects a single-sample stream", () => {
    expect(() =>
      computeGradientProfile({ distance: [0], altitude: [10] }),
    ).toThrow(GradientProfileError);
  });

  it("rejects a distance stream that never advances", () => {
    expect(() =>
      computeGradientProfile({ distance: [5, 5, 5], altitude: [1, 2, 3] }),
    ).toThrow(/does not advance/);
  });
});
