import { z } from "zod";
import { type StravaStats } from "../stravaClient";

// ---------- get-athlete-stats ----------
const TotalSchema = z.object({
  count: z.number().int(),
  distance_m: z.number().describe("Distance in meters"),
  moving_time_s: z.number().int(),
  elevation_gain_m: z.number(),
});
export const AthleteStatsOutputSchema = z.object({
  recent_run_totals: TotalSchema.nullable(),
  ytd_run_totals: TotalSchema.nullable(),
  all_run_totals: TotalSchema.nullable(),
  recent_ride_totals: TotalSchema.nullable(),
  ytd_ride_totals: TotalSchema.nullable(),
  all_ride_totals: TotalSchema.nullable(),
  recent_swim_totals: TotalSchema.nullable(),
  ytd_swim_totals: TotalSchema.nullable(),
  all_swim_totals: TotalSchema.nullable(),
  biggest_ride_distance_m: z.number().nullable(),
  biggest_climb_elevation_gain_m: z.number().nullable(),
});
export type AthleteStatsOutput = z.infer<typeof AthleteStatsOutputSchema>;

type RawTotal =
  | {
      count: number;
      distance: number;
      moving_time: number;
      elevation_gain: number;
    }
  | null
  | undefined;

function mapTotal(t: RawTotal) {
  return t
    ? {
        count: t.count,
        distance_m: t.distance,
        moving_time_s: t.moving_time,
        elevation_gain_m: t.elevation_gain,
      }
    : null;
}

export function buildAthleteStatsOutput(s: StravaStats): AthleteStatsOutput {
  return {
    recent_run_totals: mapTotal(s.recent_run_totals),
    ytd_run_totals: mapTotal(s.ytd_run_totals),
    all_run_totals: mapTotal(s.all_run_totals),
    recent_ride_totals: mapTotal(s.recent_ride_totals),
    ytd_ride_totals: mapTotal(s.ytd_ride_totals),
    all_ride_totals: mapTotal(s.all_ride_totals),
    recent_swim_totals: mapTotal(s.recent_swim_totals),
    ytd_swim_totals: mapTotal(s.ytd_swim_totals),
    all_swim_totals: mapTotal(s.all_swim_totals),
    biggest_ride_distance_m: s.biggest_ride_distance ?? null,
    biggest_climb_elevation_gain_m: s.biggest_climb_elevation_gain ?? null,
  };
}

// ---------- get-athlete-zones ----------
// Mirrors the raw Strava athlete-zones API object (StravaAthleteZones).
// looseObject() lets extra/unknown API fields pass through without failing.
const ZoneRangeSchema = z.object({
  min: z.number(),
  max: z.number().optional(),
});
const DistributionBucketSchema = z.object({
  min: z.number(),
  max: z.number(),
  time: z.number().int().describe("Seconds spent in this bucket"),
});
const HeartRateZoneSetSchema = z.looseObject({
  custom_zones: z.boolean(),
  zones: z.array(ZoneRangeSchema),
  distribution_buckets: z.array(DistributionBucketSchema).optional(),
  resource_state: z.number().int().optional(),
  sensor_based: z.boolean().optional(),
  points: z.number().int().optional(),
  type: z.literal("heartrate").optional(),
});
const PowerZoneSetSchema = z.looseObject({
  zones: z.array(ZoneRangeSchema),
  distribution_buckets: z.array(DistributionBucketSchema).optional(),
  resource_state: z.number().int().optional(),
  sensor_based: z.boolean().optional(),
  points: z.number().int().optional(),
  type: z.literal("power").optional(),
});
export const AthleteZonesOutputSchema = z.looseObject({
  heart_rate: HeartRateZoneSetSchema.optional(),
  power: PowerZoneSetSchema.optional(),
});

// ---------- get-training-load ----------
const TrainingActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().describe("ISO date YYYY-MM-DD"),
  distance_km: z.number(),
});
export const TrainingLoadOutputSchema = z.object({
  period: z.object({
    days: z.number().int(),
    start_date: z.string(),
    end_date: z.string(),
  }),
  totals: z.object({
    runs: z.number().int(),
    distance_km: z.number(),
    time_hours: z.number(),
    elevation_m: z.number(),
  }),
  averages: z.object({
    runs_per_week: z.number(),
    distance_km_per_week: z.number(),
    time_hours_per_week: z.number(),
  }),
  trend: z.string().describe("Human-readable trend label"),
  weekly_breakdown: z.array(
    z.object({
      week_starting: z.string(),
      runs: z.number().int(),
      distance_km: z.number(),
      time_hours: z.number(),
      time_formatted: z.string(),
      elevation_m: z.number(),
      activities: z.array(TrainingActivitySchema),
    }),
  ),
  warnings: z.array(z.string()),
});

// ---------- get-running-summary ----------
const PaceSchema = z.object({
  min_per_km: z.string(),
  min_per_mile: z.string(),
});
export const RunningSummaryOutputSchema = z.object({
  activity_id: z
    .number()
    .describe("The requested Strava activity id (as supplied to the tool)"),
  name: z.string(),
  date: z.string(),
  type: z.string(),
  distance: z.object({
    meters: z.number(),
    km: z.number(),
    miles: z.number(),
  }),
  time: z.object({
    moving_seconds: z.number().int(),
    moving_formatted: z.string(),
    elapsed_seconds: z.number().int(),
    elapsed_formatted: z.string(),
  }),
  pace: PaceSchema.extend({ display: z.string() }).nullable(),
  elevation: z.object({ gain_m: z.number(), gain_ft: z.number() }),
  cadence: z
    .object({
      average_spm: z.number(),
      assessment: z.string().nullable(),
    })
    .nullable(),
  heart_rate: z
    .object({
      average: z.number().nullable(),
      max: z.number().nullable(),
      zones: z.unknown().nullable(),
    })
    .nullable(),
  power: z
    .object({
      average_watts: z.number(),
      max_watts: z.number().nullable(),
    })
    .nullable(),
  laps: z.array(z.unknown()),
  gear: z.string().nullable(),
});

// ---------- compare-activities ----------
const CompareSideSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  type: z.string(),
  distance_km: z.number(),
  time_formatted: z.string(),
  pace: PaceSchema.extend({ raw_min_per_km: z.number() }).nullable(),
  avg_hr: z.number().nullable(),
  max_hr: z.number().nullable(),
  cadence_spm: z.number().nullable(),
  elevation_gain_m: z.number(),
});
export const CompareActivitiesOutputSchema = z.object({
  activity_1: CompareSideSchema,
  activity_2: CompareSideSchema,
  differences: z.object({
    distance_km: z.number(),
    pace: z
      .object({
        seconds_per_km: z.number(),
        interpretation: z.string(),
      })
      .nullable(),
    avg_hr: z.number().nullable(),
    cadence_spm: z.number().nullable(),
    elevation_gain_m: z.number(),
  }),
  efficiency: z
    .object({
      activity_1: z.number(),
      activity_2: z.number(),
      change_percent: z.number(),
      interpretation: z.string(),
      note: z.string(),
    })
    .nullable(),
  warnings: z.array(z.string()).optional(),
});

// ---------- dev-only schema drift guard ----------
export function warnOnSchemaDrift<T>(
  toolName: string,
  schema: z.ZodType<T>,
  value: unknown,
): void {
  if (process.env.NODE_ENV === "production") return;
  const result = schema.safeParse(value);
  if (!result.success) {
    console.error(
      `[${toolName}] structuredContent schema drift:`,
      result.error,
    );
  }
}

// ---------- get-best-efforts ----------
const BestEffortEntrySchema = z.object({
  activity_id: z.string(),
  activity_name: z.string(),
  date: z.string(),
  elapsed_time_seconds: z.number().int(),
  elapsed_time_formatted: z.string(),
  moving_time_seconds: z.number().int(),
  moving_time_formatted: z.string(),
  pace: PaceSchema.nullable(),
  pr_rank: z.number().int().nullable(),
});
export const BestEffortsOutputSchema = z.object({
  best_efforts: z.record(z.string(), z.array(BestEffortEntrySchema)),
  activities_analyzed: z.number().int(),
  activities_with_efforts: z.number().int(),
  note: z.string(),
});
