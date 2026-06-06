import { isRunning, smooth } from "@strava-mcp/data";
import {
  type OverlayPoint,
  type OverlayStreamData,
  type PaceZone,
  type RunSummary,
} from "./types";

/** Pace zones in min/km. Lower number = faster pace. */
export const PACE_ZONES: PaceZone[] = [
  { label: "Threshold", minPace: 0, maxPace: 4 },
  { label: "Tempo", minPace: 4, maxPace: 4.5 },
  { label: "Moderate", minPace: 4.5, maxPace: 5.5 },
  { label: "Easy", minPace: 5.5, maxPace: 20 },
];

/** Format seconds as Mm or HhMm */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h${rem > 0 ? `${rem}m` : ""}`;
}

/** Compute a rolling average over the activities array (sorted by date ascending) */
export function rollingAverage(
  activities: RunSummary[],
  window: number,
): Array<{ date: string; cadence: number }> {
  const sorted = [...activities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return sorted.map((_, i) => {
    const lo = Math.max(0, i - Math.floor(window / 2));
    const hi = Math.min(sorted.length - 1, i + Math.floor(window / 2));
    let sum = 0;
    let count = 0;
    for (let j = lo; j <= hi; j += 1) {
      if (sorted[j]!.averageCadence > 0) {
        sum += sorted[j]!.averageCadence;
        count += 1;
      }
    }
    return {
      date: sorted[i]!.date,
      cadence: count > 0 ? Math.round(sum / count) : 0,
    };
  });
}

/** Compute summary stats: current period avg, previous period avg, delta */
export function computeSummaryStats(
  activities: RunSummary[],
  weeks: number,
): {
  currentAvg: number;
  previousAvg: number;
  delta: number;
  runCount: number;
} {
  const now = Date.now();
  const halfWindow = (weeks / 2) * 7 * 24 * 60 * 60 * 1000;

  const recent = activities.filter(
    (a) =>
      now - new Date(a.date).getTime() < halfWindow && a.averageCadence > 0,
  );
  const older = activities.filter(
    (a) =>
      now - new Date(a.date).getTime() >= halfWindow && a.averageCadence > 0,
  );

  const avg = (arr: RunSummary[]) =>
    arr.length > 0
      ? Math.round(arr.reduce((s, a) => s + a.averageCadence, 0) / arr.length)
      : 0;

  const currentAvg = avg(recent);
  const previousAvg = avg(older);
  return {
    currentAvg,
    previousAvg,
    delta: currentAvg - previousAvg,
    runCount: activities.length,
  };
}

/** Group activities by pace zone and compute per-zone stats */
export function computeZoneStats(activities: RunSummary[]): Array<{
  zone: PaceZone;
  mean: number;
  min: number;
  max: number;
  count: number;
}> {
  return PACE_ZONES.map((zone) => {
    const inZone = activities.filter(
      (a) =>
        a.averagePace >= zone.minPace &&
        a.averagePace < zone.maxPace &&
        a.averageCadence > 0,
    );
    if (inZone.length === 0) {
      return { zone, mean: 0, min: 0, max: 0, count: 0 };
    }
    const cadences = inZone.map((a) => a.averageCadence);
    return {
      zone,
      mean: Math.round(cadences.reduce((s, c) => s + c, 0) / cadences.length),
      min: Math.min(...cadences),
      max: Math.max(...cadences),
      count: inZone.length,
    };
  });
}

/** Simple linear regression: y = slope * x + intercept */
export function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Convert raw stream data to overlay points for a single run */
export function toOverlayPoints(data: OverlayStreamData): OverlayPoint[] {
  const { streams } = data;
  const timeArr = streams.time ?? [];
  const distArr = streams.distance ?? [];
  const cadenceArr = streams.cadence ?? [];
  const velocityArr = streams.velocity_smooth ?? [];
  const len = timeArr.length;
  const running = isRunning(data.activityType);
  const points: OverlayPoint[] = [];

  for (let i = 0; i < len; i += 1) {
    const point: OverlayPoint = {
      distance: (distArr[i] ?? 0) / 1000,
      time: (timeArr[i] ?? 0) / 60,
    };
    if (cadenceArr[i] !== undefined) {
      point.cadence = running ? cadenceArr[i]! * 2 : cadenceArr[i];
    }
    if (velocityArr[i] !== undefined) {
      const mps = velocityArr[i]!;
      point.pace = mps > 0 ? Math.min(1000 / mps / 60, 15) : 15;
    }
    points.push(point);
  }
  return points;
}

/** Apply simple moving average to overlay points */
export function smoothOverlayPoints(
  points: OverlayPoint[],
  windowSize = 30,
): OverlayPoint[] {
  return smooth(points, ["cadence", "pace"], windowSize);
}

/** Dot size based on distance: min 4px, max 12px, scaled linearly */
export function dotSize(distanceKm: number, maxDistanceKm: number): number {
  if (maxDistanceKm <= 0) return 6;
  const ratio = Math.min(distanceKm / maxDistanceKm, 1);
  return 4 + ratio * 8;
}
