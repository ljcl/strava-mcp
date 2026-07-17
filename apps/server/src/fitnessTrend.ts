/**
 * CTL/ATL/TSB fitness-trend math for `get-fitness-trend` (#181). Pure
 * functions over daily relative-effort loads, unit-tested next to
 * `trainingLoad.ts`.
 *
 * The model is the classic performance-management chart: CTL ("fitness") is
 * an exponentially weighted average of daily load with a 42-day time
 * constant, ATL ("fatigue") the same with a 7-day constant, and
 * TSB ("form") = CTL − ATL. Load is Strava's relative effort
 * (`suffer_score`), which is HR-based — directionally consistent with
 * TRIMP-based CTL/ATL from other tools, but not absolutely comparable.
 */

/** Minimal slice of a Strava activity the trend needs. */
export interface FitnessTrendActivity {
  start_date: string;
  start_date_local?: string;
  suffer_score?: number | null;
}

export interface FitnessTrendDay {
  /** ISO date (YYYY-MM-DD) the values were computed for. */
  date: string;
  /** Total relative effort recorded that day (0 on rest days). */
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface FitnessTrendOptions {
  /** Last day of the series (YYYY-MM-DD). Days count back from here. */
  endDate: string;
  /** Length of the computed series in days. */
  days: number;
  /** Project this many zero-load days past endDate (rest-only decay). */
  projectDays?: number;
}

export interface FitnessTrendResult {
  days: FitnessTrendDay[];
  /** The endDate row, for headline values. Null only for an empty window. */
  current: FitnessTrendDay | null;
  /** Zero-load decay projection past endDate; empty when not requested. */
  projection: FitnessTrendDay[];
  /**
   * First projected date on which TSB crosses ≥ 0, or null if it never does
   * within the projection (or no projection was requested).
   */
  tsbPositiveDate: string | null;
  flags: string[];
}

/** CTL time constant in days (chronic / "fitness"). */
export const CTL_TIME_CONSTANT_DAYS = 42;
/** ATL time constant in days (acute / "fatigue"). */
export const ATL_TIME_CONSTANT_DAYS = 7;
/** TSB at or below this is deep-fatigue territory. */
export const DEEP_FATIGUE_TSB = -25;
/** Consecutive days at or below DEEP_FATIGUE_TSB before flagging. */
export const DEEP_FATIGUE_DAYS = 5;
/** TSB at or above this reads as fresh / race-ready (detraining if held). */
export const FRESH_TSB = 15;

const CTL_DECAY = Math.exp(-1 / CTL_TIME_CONSTANT_DAYS);
const ATL_DECAY = Math.exp(-1 / ATL_TIME_CONSTANT_DAYS);

const round1 = (value: number) => Math.round(value * 10) / 10;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

/** Local calendar day (YYYY-MM-DD) an activity belongs to. */
export function activityDay(activity: FitnessTrendActivity): string {
  return (activity.start_date_local || activity.start_date).split("T")[0]!;
}

/**
 * Sum relative effort per local calendar day. Activities without a
 * `suffer_score` (no HR data) contribute zero load.
 */
export function dailyLoads(
  activities: FitnessTrendActivity[],
): Map<string, number> {
  const loads = new Map<string, number>();
  for (const activity of activities) {
    const day = activityDay(activity);
    loads.set(day, (loads.get(day) ?? 0) + (activity.suffer_score ?? 0));
  }
  return loads;
}

/**
 * Build the daily CTL/ATL/TSB series. Both averages start from zero at the
 * window start, so the first few weeks under-read true fitness — callers
 * should use a lookback of ~90 days so the early ramp has settled by the
 * dates that matter. Rest days decay both curves; multiple activities on one
 * day are summed before the update.
 */
export function buildFitnessTrend(
  activities: FitnessTrendActivity[],
  options: FitnessTrendOptions,
): FitnessTrendResult {
  const { endDate, days, projectDays = 0 } = options;
  const loads = dailyLoads(activities);
  const startDate = addDays(endDate, -(days - 1));

  const series: FitnessTrendDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const load = loads.get(date) ?? 0;
    ctl = load * (1 - CTL_DECAY) + ctl * CTL_DECAY;
    atl = load * (1 - ATL_DECAY) + atl * ATL_DECAY;
    series.push({
      date,
      load: round1(load),
      ctl: round1(ctl),
      atl: round1(atl),
      tsb: round1(ctl - atl),
    });
  }

  const projection: FitnessTrendDay[] = [];
  let tsbPositiveDate: string | null = null;
  let projCtl = ctl;
  let projAtl = atl;
  for (let i = 1; i <= projectDays; i++) {
    projCtl *= CTL_DECAY;
    projAtl *= ATL_DECAY;
    const tsb = projCtl - projAtl;
    const date = addDays(endDate, i);
    projection.push({
      date,
      load: 0,
      ctl: round1(projCtl),
      atl: round1(projAtl),
      tsb: round1(tsb),
    });
    if (tsbPositiveDate === null && tsb >= 0) {
      tsbPositiveDate = date;
    }
  }

  return {
    days: series,
    current: series[series.length - 1] ?? null,
    projection,
    tsbPositiveDate,
    flags: computeFlags(series),
  };
}

/**
 * Simple, tunable flags over the computed series. Deep fatigue looks at the
 * longest run of very negative TSB that reaches the end of the window (an
 * old resolved block is history, not a flag); freshness and ramp look at the
 * current values only.
 */
export function computeFlags(series: FitnessTrendDay[]): string[] {
  const flags: string[] = [];
  if (series.length === 0) return flags;

  let deepStreak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i]!.tsb <= DEEP_FATIGUE_TSB) deepStreak++;
    else break;
  }
  if (deepStreak >= DEEP_FATIGUE_DAYS) {
    flags.push(
      `TSB at or below ${DEEP_FATIGUE_TSB} for ${deepStreak} consecutive days — deep fatigue; an easy block or rest is overdue.`,
    );
  }

  const current = series[series.length - 1]!;
  if (current.tsb >= FRESH_TSB) {
    flags.push(
      `TSB at ${current.tsb} (≥ +${FRESH_TSB}) — fresh and race-ready now, but fitness decays if this holds for long.`,
    );
  }

  // CTL ramp over the trailing week, when the window is long enough.
  if (series.length >= 8) {
    const weekAgo = series[series.length - 8]!;
    const ramp = round1(current.ctl - weekAgo.ctl);
    if (ramp >= 5) {
      flags.push(
        `CTL climbed ${ramp} in the last 7 days — a steep ramp; sustained rates above ~5/week carry injury and illness risk.`,
      );
    }
  }

  return flags;
}
