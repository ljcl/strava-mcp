/**
 * Pure mapping for the activity-zones MCP App feed (#34). Turns the raw
 * `/activities/{id}/zones` response into the chart-ready payload
 * `get-activity-zones-data` returns, unit-tested next to
 * `activitySegments.ts`. The `get-activity-zones` text tool formats the same
 * fetch as prose; this feed carries per-bucket seconds and percentages so
 * the chart and the text can never disagree on the numbers.
 */
import { type StravaActivityZone } from "./stravaClient";

export interface ZoneBucket {
  /** 1-based zone number (Z1 = 1). */
  zone: number;
  /** Lower bound in the set's unit (bpm or W). */
  min: number;
  /** Upper bound, or null for the open-ended top zone (Strava sends -1). */
  max: number | null;
  seconds: number;
  /** Share of the set's total time, 0–100 with one decimal. */
  pct: number;
}

export interface ZoneSet {
  type: "heartrate" | "power";
  unit: "bpm" | "W";
  /** Whether the zones came from a real sensor (null when Strava omits it). */
  sensorBased: boolean | null;
  totalSeconds: number;
  buckets: ZoneBucket[];
}

export interface ActivityZonesData {
  activityId: string;
  name: string;
  /** Local start date, ISO. */
  date: string;
  type: string;
  zoneSets: ZoneSet[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Map the raw zone response to chart-ready sets. Sets without distribution
 * buckets (no sensor) and unknown set types are dropped; a zero-time set is
 * kept only if some bucket has time.
 */
export function mapActivityZones(zones: StravaActivityZone[]): ZoneSet[] {
  const sets: ZoneSet[] = [];
  for (const zone of zones) {
    if (zone.type !== "heartrate" && zone.type !== "power") continue;
    const buckets = zone.distribution_buckets ?? [];
    const totalSeconds = buckets.reduce((sum, b) => sum + b.time, 0);
    if (buckets.length === 0 || totalSeconds <= 0) continue;

    sets.push({
      type: zone.type,
      unit: zone.type === "heartrate" ? "bpm" : "W",
      sensorBased: zone.sensor_based ?? null,
      totalSeconds,
      buckets: buckets.map((bucket, i) => ({
        zone: i + 1,
        min: bucket.min,
        max: bucket.max === -1 ? null : bucket.max,
        seconds: bucket.time,
        pct: round1((bucket.time / totalSeconds) * 100),
      })),
    });
  }
  return sets;
}

/** The bucket with the most time in a set (first wins ties). */
export function dominantBucket(set: ZoneSet): ZoneBucket {
  return set.buckets.reduce((top, bucket) =>
    bucket.seconds > top.seconds ? bucket : top,
  );
}
