import { type SummaryStat } from "@strava-mcp/ui";
import { type ZoneBucket, type ZoneSet } from "./types";

/** One chart row per zone bucket. */
export interface ZoneRow {
  label: string;
  /** "0–120 bpm" or "175+ bpm". */
  range: string;
  minutes: number;
  seconds: number;
  pct: number;
}

export function formatZoneRange(bucket: ZoneBucket, unit: string): string {
  return bucket.max == null
    ? `${bucket.min}+ ${unit}`
    : `${bucket.min}–${bucket.max} ${unit}`;
}

/** "1h 05m", "45m", "3m" — durations on the summary bar. */
export function formatDurationShort(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function buildZoneRows(set: ZoneSet): ZoneRow[] {
  return set.buckets.map((bucket) => ({
    label: `Z${bucket.zone}`,
    range: formatZoneRange(bucket, set.unit),
    minutes: Math.round((bucket.seconds / 60) * 10) / 10,
    seconds: bucket.seconds,
    pct: bucket.pct,
  }));
}

/**
 * Easy/moderate/hard split percentages: zones 1–2 are easy, zone 3 moderate,
 * zone 4 and above hard. Matches the intensity distribution convention used
 * by the running-summary tool for 5-zone HR and degrades sensibly for the
 * 6+-zone power sets.
 */
export function intensitySplit(set: ZoneSet): {
  easyPct: number;
  moderatePct: number;
  hardPct: number;
} {
  let easy = 0;
  let moderate = 0;
  let hard = 0;
  for (const bucket of set.buckets) {
    if (bucket.zone <= 2) easy += bucket.seconds;
    else if (bucket.zone === 3) moderate += bucket.seconds;
    else hard += bucket.seconds;
  }
  const total = set.totalSeconds || 1;
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  return { easyPct: pct(easy), moderatePct: pct(moderate), hardPct: pct(hard) };
}

/** The bucket with the most time in a set (first wins ties). */
export function dominantBucket(set: ZoneSet): ZoneBucket {
  return set.buckets.reduce((top, bucket) =>
    bucket.seconds > top.seconds ? bucket : top,
  );
}

/** SummaryBar stats for the active zone set. */
export function buildSummaryStats(set: ZoneSet): SummaryStat[] {
  const split = intensitySplit(set);
  return [
    { label: "Time", value: formatDurationShort(set.totalSeconds) },
    { label: "Mostly", value: `Z${dominantBucket(set).zone}` },
    { label: "Easy Z1–2", value: `${split.easyPct}%` },
    { label: "Hard Z4+", value: `${split.hardPct}%` },
  ];
}
