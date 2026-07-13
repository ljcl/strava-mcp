/**
 * Pure training-load aggregation shared by the `get-training-load` text tool
 * and the `get-training-load-data` MCP App feed (#27). The injury-risk
 * warning rules live here once, so the chart's per-week flags can never
 * drift from the text tool's prose warnings.
 */

/** Monday-start week key (YYYY-MM-DD) for an activity date. */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  return d.toISOString().split("T")[0]!;
}

export interface WeeklyVolume {
  week_starting: string;
  distance_km: number;
}

export interface WeekWarning {
  week_starting: string;
  reason: string;
}

/**
 * Injury-risk warnings per week: a >30% week-over-week volume increase, and
 * an unusually high week (>150% of the period average and over 30 km). One
 * week can trigger both rules. The text tool prefixes each reason with
 * "Week of <date>: "; the app feed attaches them to the week's row.
 */
export function computeWeekWarnings(weeks: WeeklyVolume[]): WeekWarning[] {
  const warnings: WeekWarning[] = [];

  if (weeks.length < 2) {
    return warnings;
  }

  // Check for sudden volume increases (>30% week over week)
  for (let i = 1; i < weeks.length; i += 1) {
    const prevDist = weeks[i - 1]!.distance_km;
    const currDist = weeks[i]!.distance_km;

    if (prevDist > 0 && currDist > prevDist * 1.3) {
      const increase = Math.round((currDist / prevDist - 1) * 100);
      warnings.push({
        week_starting: weeks[i]!.week_starting,
        reason: `Volume increased ${increase}% from previous week - consider injury risk`,
      });
    }
  }

  // Check for very high weeks compared to average
  const avgDistance =
    weeks.reduce((sum, w) => sum + w.distance_km, 0) / weeks.length;

  for (const week of weeks) {
    if (week.distance_km > avgDistance * 1.5 && week.distance_km > 30) {
      warnings.push({
        week_starting: week.week_starting,
        reason: `Unusually high volume (${week.distance_km} km vs ${Math.round(avgDistance)} km average)`,
      });
    }
  }

  return warnings;
}

/**
 * Centered rolling average over a weekly series. Zero weeks count toward the
 * average — a skipped week genuinely lowers the volume trend.
 */
export function rollingTrend(values: number[], window = 3): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j += 1) sum += values[j]!;
    return sum / (hi - lo + 1);
  });
}

/** Minimal slice of a Strava activity the aggregation needs. */
export interface TrainingLoadActivity {
  start_date: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  total_elevation_gain?: number;
}

export interface TrainingLoadWeek {
  weekStarting: string;
  runs: number;
  distanceKm: number;
  timeHours: number;
  elevationM: number;
  /** Rolling-average volume for the trend line, in km. */
  trendKm: number;
  warning: boolean;
  warningReasons: string[];
}

export interface TrainingLoadAppData {
  days: number;
  totals: {
    runs: number;
    distanceKm: number;
    timeHours: number;
    elevationM: number;
  };
  weeks: TrainingLoadWeek[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

/**
 * Aggregate activities into the chart-ready weekly payload: per-week volume,
 * gap weeks filled with zeros (so the timeline is continuous and a skipped
 * week is visible), a rolling-average trend value per week, and the warning
 * flags. Warnings are computed on the non-empty weeks only, exactly like the
 * text tool, so both surfaces always agree.
 */
export function buildTrainingLoadData(
  activities: TrainingLoadActivity[],
  days: number,
): TrainingLoadAppData {
  interface Bucket {
    runs: number;
    distanceM: number;
    timeS: number;
    elevationM: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const activity of activities) {
    const weekKey = getWeekStart(
      new Date(activity.start_date_local || activity.start_date),
    );
    const bucket = buckets.get(weekKey) ?? {
      runs: 0,
      distanceM: 0,
      timeS: 0,
      elevationM: 0,
    };
    bucket.runs += 1;
    bucket.distanceM += activity.distance || 0;
    bucket.timeS += activity.moving_time || 0;
    bucket.elevationM += activity.total_elevation_gain || 0;
    buckets.set(weekKey, bucket);
  }

  const sortedKeys = [...buckets.keys()].sort();

  // Same rounding as the text tool's weekly breakdown.
  const nonEmptyWeeks: WeeklyVolume[] = sortedKeys.map((key) => ({
    week_starting: key,
    distance_km: Math.round(buckets.get(key)!.distanceM / 10) / 100,
  }));

  const reasonsByWeek = new Map<string, string[]>();
  for (const warning of computeWeekWarnings(nonEmptyWeeks)) {
    const reasons = reasonsByWeek.get(warning.week_starting) ?? [];
    reasons.push(warning.reason);
    reasonsByWeek.set(warning.week_starting, reasons);
  }

  // Continuous Monday-to-Monday timeline from first to last active week.
  const weekKeys: string[] = [];
  if (sortedKeys.length > 0) {
    const last = sortedKeys[sortedKeys.length - 1]!;
    for (let key = sortedKeys[0]!; key <= last; key = addDays(key, 7)) {
      weekKeys.push(key);
    }
  }

  const distances = weekKeys.map((key) =>
    buckets.has(key) ? Math.round(buckets.get(key)!.distanceM / 10) / 100 : 0,
  );
  const trend = rollingTrend(distances);

  const weeks: TrainingLoadWeek[] = weekKeys.map((key, i) => {
    const bucket = buckets.get(key);
    const warningReasons = reasonsByWeek.get(key) ?? [];
    return {
      weekStarting: key,
      runs: bucket?.runs ?? 0,
      distanceKm: distances[i]!,
      timeHours: bucket ? Math.round((bucket.timeS / 3600) * 100) / 100 : 0,
      elevationM: bucket ? Math.round(bucket.elevationM) : 0,
      trendKm: Math.round(trend[i]! * 100) / 100,
      warning: warningReasons.length > 0,
      warningReasons,
    };
  });

  return {
    days,
    totals: {
      runs: weeks.reduce((sum, w) => sum + w.runs, 0),
      distanceKm:
        Math.round(weeks.reduce((sum, w) => sum + w.distanceKm, 0) * 100) / 100,
      timeHours:
        Math.round(weeks.reduce((sum, w) => sum + w.timeHours, 0) * 100) / 100,
      elevationM: weeks.reduce((sum, w) => sum + w.elevationM, 0),
    },
    weeks,
  };
}
