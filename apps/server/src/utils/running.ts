/**
 * Running-specific utility functions for transforming Strava data.
 *
 * These functions address common issues with Strava's API:
 * - Cadence is returned as strides/min but runners think in steps/min
 * - Speed is returned as m/s but runners think in pace (min/km or min/mile)
 */

import { formatDuration } from "../formatters";

/** Activity types that use steps-per-minute cadence */
export const RUNNING_ACTIVITY_TYPES = [
  "Run",
  "VirtualRun",
  "TrailRun",
  "Walk",
  "Hike",
];

/**
 * Check if an activity type is a running activity.
 */
export function isRunningActivity(activityType: string): boolean {
  return RUNNING_ACTIVITY_TYPES.includes(activityType);
}

/**
 * Cadence transformation result.
 */
export interface CadenceResult {
  raw: number;
  spm: number | null; // steps per minute (running)
  rpm: number | null; // revolutions per minute (cycling)
  display: string;
}

/**
 * Transform cadence based on activity type.
 * Running activities get doubled to show steps per minute (Strava returns strides).
 */
export function transformCadence(
  rawCadence: number | null | undefined,
  activityType: string,
): CadenceResult | null {
  if (rawCadence === null || rawCadence === undefined) {
    return null;
  }

  if (isRunningActivity(activityType)) {
    const spm = rawCadence * 2;
    return {
      raw: rawCadence,
      spm,
      rpm: null,
      display: `${Math.round(spm)} spm`,
    };
  }

  // Cycling, swimming, etc. - return as-is
  return {
    raw: rawCadence,
    spm: null,
    rpm: rawCadence,
    display: `${Math.round(rawCadence)} rpm`,
  };
}

/**
 * Pace conversion result.
 */
export interface PaceResult {
  metersPerSecond: number;
  kmh: number;
  minPerKm: string;
  minPerKmRaw: number; // decimal minutes for calculations
  minPerMile: string;
  minPerMileRaw: number;
  display: string;
}

/**
 * Format seconds as M:SS pace string.
 */
function formatPaceString(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Convert meters per second to running pace formats.
 * Returns null if speed is zero or invalid.
 */
export function metersPerSecToPace(
  mps: number | null | undefined,
): PaceResult | null {
  if (mps === null || mps === undefined || mps <= 0) {
    return null;
  }

  const secondsPerKm = 1000 / mps;
  const secondsPerMile = 1609.34 / mps;

  return {
    metersPerSecond: Math.round(mps * 100) / 100,
    kmh: Math.round(mps * 3.6 * 10) / 10,
    minPerKm: formatPaceString(secondsPerKm),
    minPerKmRaw: Math.round((secondsPerKm / 60) * 100) / 100,
    minPerMile: formatPaceString(secondsPerMile),
    minPerMileRaw: Math.round((secondsPerMile / 60) * 100) / 100,
    display: `${formatPaceString(secondsPerKm)} /km`,
  };
}

/**
 * Power-to-weight result.
 */
export interface WattsPerKgResult {
  watts: number;
  weightKg: number;
  wattsPerKg: number;
  intensity: "easy" | "moderate" | "tempo" | "high";
}

/**
 * Compute power-to-weight ratio.
 * Returns null if either value is missing or invalid.
 */
export function computeWattsPerKg(
  watts: number | null | undefined,
  weightKg: number | null | undefined,
): WattsPerKgResult | null {
  if (!watts || !weightKg || weightKg <= 0) {
    return null;
  }

  const wattsPerKg = watts / weightKg;

  // Basic intensity interpretation for running
  let intensity: WattsPerKgResult["intensity"];
  if (wattsPerKg < 3.0) {
    intensity = "easy";
  } else if (wattsPerKg < 4.0) {
    intensity = "moderate";
  } else if (wattsPerKg < 5.0) {
    intensity = "tempo";
  } else {
    intensity = "high";
  }

  return {
    watts: Math.round(watts * 10) / 10,
    weightKg: Math.round(weightKg * 10) / 10,
    wattsPerKg: Math.round(wattsPerKg * 100) / 100,
    intensity,
  };
}

/**
 * Cadence assessment for running.
 */
export function assessCadence(spm: number | null | undefined): string | null {
  if (spm === null || spm === undefined) {
    return null;
  }

  if (spm < 160) {
    return "low - consider increasing for efficiency";
  }
  if (spm < 170) {
    return "moderate - room for improvement";
  }
  if (spm < 180) {
    return "good";
  }
  if (spm < 190) {
    return "very good";
  }
  return "excellent";
}

/**
 * Heart rate zone boundaries from athlete profile.
 */
export interface ZoneBoundary {
  min: number;
  max: number;
}

/**
 * Determine which HR zone a heart rate falls into.
 */
export function getZoneForHr(
  hr: number,
  zoneBoundaries: ZoneBoundary[],
): number {
  for (let i = 0; i < zoneBoundaries.length; i += 1) {
    const zone = zoneBoundaries[i]!;
    const zoneMin = zone.min ?? 0;
    const zoneMax = zone.max ?? 999;
    // Handle Strava's -1 for unbounded max
    const effectiveMax = zoneMax === -1 ? 999 : zoneMax;

    if (hr >= zoneMin && hr < effectiveMax) {
      return i + 1;
    }
  }
  return 5; // Default to zone 5 if above all boundaries
}

/**
 * Time-in-zone result for a single zone.
 */
export interface ZoneTime {
  seconds: number;
  formatted: string;
  percentage: number;
}

/**
 * Complete time-in-zones result.
 */
export interface TimeInZonesResult {
  totalTimeSeconds: number;
  zones: {
    zone_1: ZoneTime;
    zone_2: ZoneTime;
    zone_3: ZoneTime;
    zone_4: ZoneTime;
    zone_5: ZoneTime;
  };
  distribution: {
    easy_1_2: number;
    moderate_3: number;
    hard_4_5: number;
  };
}

/**
 * Compute time spent in each heart rate zone.
 */
export function computeTimeInZones(
  hrStream: number[],
  timeStream: number[],
  zoneBoundaries: ZoneBoundary[],
): TimeInZonesResult | null {
  if (
    !hrStream ||
    !timeStream ||
    hrStream.length !== timeStream.length ||
    hrStream.length < 2 ||
    !zoneBoundaries ||
    zoneBoundaries.length === 0
  ) {
    return null;
  }

  const zones: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (let i = 1; i < hrStream.length; i += 1) {
    const hr = hrStream[i]!;
    const timeDelta = timeStream[i]! - timeStream[i - 1]!;
    const zone = getZoneForHr(hr, zoneBoundaries);
    zones[zone]! += timeDelta;
  }

  const totalTime = Object.values(zones).reduce((a, b) => a + b, 0);

  if (totalTime <= 0) {
    return null;
  }

  const makeZoneTime = (seconds: number): ZoneTime => ({
    seconds,
    formatted: formatDuration(seconds),
    percentage: Math.round((seconds / totalTime) * 1000) / 10,
  });

  return {
    totalTimeSeconds: totalTime,
    zones: {
      zone_1: makeZoneTime(zones[1]!),
      zone_2: makeZoneTime(zones[2]!),
      zone_3: makeZoneTime(zones[3]!),
      zone_4: makeZoneTime(zones[4]!),
      zone_5: makeZoneTime(zones[5]!),
    },
    distribution: {
      easy_1_2: Math.round(((zones[1]! + zones[2]!) / totalTime) * 1000) / 10,
      moderate_3: Math.round((zones[3]! / totalTime) * 1000) / 10,
      hard_4_5: Math.round(((zones[4]! + zones[5]!) / totalTime) * 1000) / 10,
    },
  };
}

// Re-export formatDuration for backwards compatibility
export { formatDuration } from "../formatters";
