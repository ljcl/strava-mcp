import { describe, expect, it } from "vitest";
import {
  assessCadence,
  computeTimeInZones,
  computeWattsPerKg,
  formatDuration,
  getZoneForHr,
  isRunningActivity,
  metersPerSecToPace,
  transformCadence,
} from "./running";

describe("isRunningActivity", () => {
  it("returns true for Run", () => {
    expect(isRunningActivity("Run")).toBe(true);
  });

  it("returns true for VirtualRun", () => {
    expect(isRunningActivity("VirtualRun")).toBe(true);
  });

  it("returns true for TrailRun", () => {
    expect(isRunningActivity("TrailRun")).toBe(true);
  });

  it("returns true for Walk", () => {
    expect(isRunningActivity("Walk")).toBe(true);
  });

  it("returns true for Hike", () => {
    expect(isRunningActivity("Hike")).toBe(true);
  });

  it("returns false for Ride", () => {
    expect(isRunningActivity("Ride")).toBe(false);
  });

  it("returns false for Swim", () => {
    expect(isRunningActivity("Swim")).toBe(false);
  });
});

describe("transformCadence", () => {
  it("doubles cadence for running activities (strides to steps)", () => {
    const result = transformCadence(85, "Run");
    expect(result?.spm).toBe(170);
    expect(result?.display).toBe("170 spm");
  });

  it("returns rpm unchanged for cycling", () => {
    const result = transformCadence(90, "Ride");
    expect(result?.rpm).toBe(90);
    expect(result?.display).toBe("90 rpm");
  });

  it("returns null for null input", () => {
    expect(transformCadence(null, "Run")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(transformCadence(undefined, "Run")).toBeNull();
  });

  it("preserves raw value", () => {
    const result = transformCadence(85, "Run");
    expect(result?.raw).toBe(85);
  });
});

describe("metersPerSecToPace", () => {
  it("converts 3.33 m/s to approximately 5:00/km pace", () => {
    const result = metersPerSecToPace(3.333);
    expect(result?.minPerKm).toBe("5:00");
  });

  it("calculates km/h correctly", () => {
    const result = metersPerSecToPace(3.333);
    expect(result?.kmh).toBeCloseTo(12.0, 1);
  });

  it("returns null for zero speed", () => {
    expect(metersPerSecToPace(0)).toBeNull();
  });

  it("returns null for negative speed", () => {
    expect(metersPerSecToPace(-1)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(metersPerSecToPace(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(metersPerSecToPace(undefined)).toBeNull();
  });

  it("calculates mile pace correctly", () => {
    const result = metersPerSecToPace(3.333);
    // 1609.34m / 3.333 m/s ≈ 483 seconds ≈ 8:03 per mile
    expect(result?.minPerMile).toBe("8:03");
  });

  it("carries seconds rollover in km pace instead of emitting :60", () => {
    // 1000 / 2.7816 ≈ 359.5 s/km; naive rounding would render "5:60".
    const result = metersPerSecToPace(2.7816);
    expect(result?.minPerKm).toBe("6:00");
    expect(result?.display).toBe("6:00 /km");
  });

  it("carries seconds rollover in mile pace instead of emitting :60", () => {
    // 1609.34 / 2.684 ≈ 599.6 s/mile; naive rounding would render "9:60".
    const result = metersPerSecToPace(2.684);
    expect(result?.minPerMile).toBe("10:00");
  });
});

describe("formatDuration", () => {
  it("formats seconds under an hour", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats seconds over an hour", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("returns N/A for null", () => {
    expect(formatDuration(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatDuration(undefined)).toBe("N/A");
  });

  it("returns N/A for negative values", () => {
    expect(formatDuration(-10)).toBe("N/A");
  });

  it("formats zero seconds correctly", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("pads single digit seconds", () => {
    expect(formatDuration(65)).toBe("1:05");
  });
});

describe("assessCadence", () => {
  it("returns low assessment for cadence under 160", () => {
    expect(assessCadence(155)).toContain("low");
  });

  it("returns moderate for cadence 160-169", () => {
    expect(assessCadence(165)).toContain("moderate");
  });

  it("returns good for cadence 170-179", () => {
    expect(assessCadence(175)).toBe("good");
  });

  it("returns very good for cadence 180-189", () => {
    expect(assessCadence(185)).toBe("very good");
  });

  it("returns excellent for cadence 190+", () => {
    expect(assessCadence(195)).toBe("excellent");
  });

  it("returns null for null input", () => {
    expect(assessCadence(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(assessCadence(undefined)).toBeNull();
  });
});

describe("computeWattsPerKg", () => {
  it("computes ratio correctly", () => {
    const result = computeWattsPerKg(250, 70);
    expect(result?.wattsPerKg).toBeCloseTo(3.57, 2);
  });

  it("returns null if watts missing", () => {
    expect(computeWattsPerKg(null, 70)).toBeNull();
  });

  it("returns null if weight missing", () => {
    expect(computeWattsPerKg(250, null)).toBeNull();
  });

  it("returns null if weight is zero", () => {
    expect(computeWattsPerKg(250, 0)).toBeNull();
  });

  it("classifies easy intensity correctly", () => {
    const result = computeWattsPerKg(150, 70); // ~2.14 W/kg
    expect(result?.intensity).toBe("easy");
  });

  it("classifies moderate intensity correctly", () => {
    const result = computeWattsPerKg(240, 70); // ~3.43 W/kg
    expect(result?.intensity).toBe("moderate");
  });

  it("classifies tempo intensity correctly", () => {
    const result = computeWattsPerKg(315, 70); // ~4.5 W/kg
    expect(result?.intensity).toBe("tempo");
  });

  it("classifies high intensity correctly", () => {
    const result = computeWattsPerKg(400, 70); // ~5.7 W/kg
    expect(result?.intensity).toBe("high");
  });
});

describe("getZoneForHr", () => {
  const zones = [
    { min: 0, max: 120 },
    { min: 120, max: 140 },
    { min: 140, max: 160 },
    { min: 160, max: 180 },
    { min: 180, max: -1 },
  ];

  it("returns zone 1 for low HR", () => {
    expect(getZoneForHr(100, zones)).toBe(1);
  });

  it("returns zone 2 for HR at boundary", () => {
    expect(getZoneForHr(120, zones)).toBe(2);
  });

  it("returns zone 3 for moderate HR", () => {
    expect(getZoneForHr(150, zones)).toBe(3);
  });

  it("returns zone 4 for elevated HR", () => {
    expect(getZoneForHr(170, zones)).toBe(4);
  });

  it("returns zone 5 for high HR", () => {
    expect(getZoneForHr(185, zones)).toBe(5);
  });

  it("handles -1 max as unbounded", () => {
    expect(getZoneForHr(200, zones)).toBe(5);
  });
});

describe("computeTimeInZones", () => {
  const zones = [
    { min: 0, max: 120 },
    { min: 120, max: 140 },
    { min: 140, max: 160 },
    { min: 160, max: 180 },
    { min: 180, max: -1 },
  ];

  it("computes time in zones correctly", () => {
    // 10 seconds in each zone
    const hrStream = [100, 130, 150, 170, 190];
    const timeStream = [0, 10, 20, 30, 40];

    const result = computeTimeInZones(hrStream, timeStream, zones);

    expect(result).not.toBeNull();
    expect(result?.totalTimeSeconds).toBe(40);
  });

  it("returns null for empty streams", () => {
    expect(computeTimeInZones([], [], zones)).toBeNull();
  });

  it("returns null for mismatched stream lengths", () => {
    expect(computeTimeInZones([100, 120], [0], zones)).toBeNull();
  });

  it("returns null for single-point streams", () => {
    expect(computeTimeInZones([100], [0], zones)).toBeNull();
  });

  it("returns null for empty zones", () => {
    expect(computeTimeInZones([100, 120], [0, 10], [])).toBeNull();
  });

  it("calculates percentages correctly", () => {
    // All time in zone 1
    const hrStream = [100, 100, 100, 100];
    const timeStream = [0, 10, 20, 30];

    const result = computeTimeInZones(hrStream, timeStream, zones);

    expect(result?.zones.zone_1.percentage).toBe(100);
    expect(result?.zones.zone_2.percentage).toBe(0);
  });
});
