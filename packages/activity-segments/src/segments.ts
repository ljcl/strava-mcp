import {
  formatPace,
  isRunning,
  normalizeValue,
  percentileDomain,
  rampColor,
} from "@strava-mcp/data";
import { type SegmentEffortRow } from "./types";

/** {min,max} speed window for the heat ramp. */
export type Domain = { min: number; max: number };

/** Slower than a walk: treat as paused rather than printing a huge pace. */
const MIN_SPEED = 0.3;

export function effortSpeed(e: SegmentEffortRow): number {
  return e.elapsedTime > 0 ? e.distanceMeters / e.elapsedTime : 0;
}

/** Speed domain across the workout's efforts (faster = hotter). */
export function buildHeatDomain(efforts: SegmentEffortRow[]): Domain {
  return percentileDomain(efforts.map(effortSpeed));
}

export function heatColor(e: SegmentEffortRow, domain: Domain): string {
  return rampColor(normalizeValue(effortSpeed(e), domain.min, domain.max));
}

function tierRank(e: SegmentEffortRow): number {
  return (e.prRank != null ? 2 : 0) + (e.komRank != null ? 1 : 0);
}

/** PR/top-10 efforts, PR-first then by rank, then run order. */
export function selectHighlights(
  efforts: SegmentEffortRow[],
): SegmentEffortRow[] {
  return efforts
    .filter((e) => e.prRank != null || e.komRank != null)
    .sort(
      (a, b) =>
        tierRank(b) - tierRank(a) ||
        (a.prRank ?? 99) - (b.prRank ?? 99) ||
        (a.komRank ?? 99) - (b.komRank ?? 99) ||
        (a.startIndex ?? Number.POSITIVE_INFINITY) -
          (b.startIndex ?? Number.POSITIVE_INFINITY),
    );
}

export function runOrder(efforts: SegmentEffortRow[]): SegmentEffortRow[] {
  return [...efforts].sort(
    (a, b) =>
      (a.startIndex ?? Number.POSITIVE_INFINITY) -
      (b.startIndex ?? Number.POSITIVE_INFINITY),
  );
}

export function summaryCounts(efforts: SegmentEffortRow[]): {
  total: number;
  prs: number;
  top10: number;
} {
  return {
    total: efforts.length,
    prs: efforts.filter((e) => e.prRank != null).length,
    top10: efforts.filter((e) => e.komRank != null).length,
  };
}

/** "12 segments, 2 PRs, 1 top-10" — plural-aware, omits zero tiers. */
export function summaryLine(efforts: SegmentEffortRow[]): string {
  const counts = summaryCounts(efforts);
  const parts = [
    `${counts.total} ${counts.total === 1 ? "segment" : "segments"}`,
  ];
  if (counts.prs > 0)
    parts.push(`${counts.prs} ${counts.prs === 1 ? "PR" : "PRs"}`);
  if (counts.top10 > 0) parts.push(`${counts.top10} top-10`);
  return parts.join(", ");
}

/**
 * Stable identity for an effort. The same segment can be ridden twice in one
 * activity, so the segment id alone is not unique; startIndex disambiguates.
 */
export function effortKey(e: SegmentEffortRow): string {
  return `${e.segmentId}-${e.startIndex ?? "x"}`;
}

/** Pace for runs ("3'45 /km"), speed for rides ("28.4 km/h"), "—" if paused. */
export function formatEffortPace(
  e: SegmentEffortRow,
  activityType: string | null,
): string {
  const speed = effortSpeed(e);
  if (speed < MIN_SPEED) return "—";
  const running = activityType ? isRunning(activityType) : true;
  return running
    ? `${formatPace(1000 / speed / 60)} /km`
    : `${(speed * 3.6).toFixed(1)} km/h`;
}

/** m:ss under an hour, h:mm:ss above. */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
