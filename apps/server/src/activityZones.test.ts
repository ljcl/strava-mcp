import { describe, expect, it } from "vitest";
import { dominantBucket, mapActivityZones } from "./activityZones";
import { type StravaActivityZone } from "./stravaClient";

function hrZone(times: number[]): StravaActivityZone {
  const bounds = [0, 120, 145, 160, 175, -1];
  return {
    type: "heartrate",
    sensor_based: true,
    distribution_buckets: times.map((time, i) => ({
      min: bounds[i]!,
      max: i === times.length - 1 ? -1 : bounds[i + 1]!,
      time,
    })),
  } as unknown as StravaActivityZone;
}

describe("mapActivityZones", () => {
  it("maps buckets with percentages and the open-ended top zone", () => {
    const sets = mapActivityZones([hrZone([600, 1800, 900, 500, 200])]);
    expect(sets).toHaveLength(1);
    const set = sets[0]!;
    expect(set.type).toBe("heartrate");
    expect(set.unit).toBe("bpm");
    expect(set.sensorBased).toBe(true);
    expect(set.totalSeconds).toBe(4000);
    expect(set.buckets).toHaveLength(5);
    expect(set.buckets[0]).toEqual({
      zone: 1,
      min: 0,
      max: 120,
      seconds: 600,
      pct: 15,
    });
    expect(set.buckets[1]!.pct).toBe(45);
    // Strava's -1 sentinel becomes null ("and above").
    expect(set.buckets[4]!.max).toBeNull();
    // Percentages account for all time.
    const pctSum = set.buckets.reduce((sum, b) => sum + b.pct, 0);
    expect(pctSum).toBeCloseTo(100, 0);
  });

  it("keeps heart rate and power as separate sets with their units", () => {
    const power = {
      type: "power",
      sensor_based: true,
      distribution_buckets: [
        { min: 0, max: 200, time: 1000 },
        { min: 200, max: -1, time: 500 },
      ],
    } as unknown as StravaActivityZone;
    const sets = mapActivityZones([hrZone([100, 100, 100, 100, 100]), power]);
    expect(sets.map((s) => s.type)).toEqual(["heartrate", "power"]);
    expect(sets[1]!.unit).toBe("W");
    expect(sets[1]!.buckets[1]!.pct).toBeCloseTo(33.3, 1);
  });

  it("drops sets without buckets, with zero time, or of unknown type", () => {
    const empty = {
      type: "heartrate",
      distribution_buckets: [],
    } as unknown as StravaActivityZone;
    const zeroTime = hrZone([0, 0, 0, 0, 0]);
    const unknown = {
      type: "pace",
      distribution_buckets: [{ min: 0, max: 1, time: 100 }],
    } as unknown as StravaActivityZone;
    expect(mapActivityZones([empty, zeroTime, unknown])).toEqual([]);
  });

  it("defaults sensorBased to null when Strava omits it", () => {
    const zone = hrZone([100, 0, 0, 0, 0]);
    (zone as { sensor_based?: boolean }).sensor_based = undefined;
    expect(mapActivityZones([zone])[0]!.sensorBased).toBeNull();
  });
});

describe("dominantBucket", () => {
  it("returns the bucket with the most time", () => {
    const set = mapActivityZones([hrZone([600, 1800, 900, 500, 200])])[0]!;
    expect(dominantBucket(set).zone).toBe(2);
  });

  it("prefers the earlier bucket on a tie", () => {
    const set = mapActivityZones([hrZone([500, 500, 100, 0, 0])])[0]!;
    expect(dominantBucket(set).zone).toBe(1);
  });
});
