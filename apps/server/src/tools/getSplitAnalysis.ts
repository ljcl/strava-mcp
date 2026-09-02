import { z } from "zod";
import {
  computeSplitAnalysis,
  SPLIT_UNIT_METRES,
  type Split,
  SplitAnalysisError,
  type SplitStreams,
  type SplitUnit,
} from "../splitAnalysis";
import {
  getActivityById,
  getActivityStreams,
  StreamsUnavailableError,
} from "../stravaClient";
import { isRunningActivity } from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { SplitAnalysisOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-split-analysis";

const description = `
Breaks one activity into even distance splits and says whether it was positive-, negative-, or evenly split — corrected for terrain.

Device laps are whatever the athlete pressed the button for; this tool ignores
them and bins the streams into fixed 1 km (or 1 mile) splits, reporting per
split:
- Moving pace and grade-adjusted (GAP, flat-equivalent) pace
- Elevation change and average grade
- Average HR, cadence, and power where recorded

The headline is the two-halves verdict, stated twice: once on the clock and
once grade-adjusted. A hilly back half slows raw pace with no fade at all, and
a course that flattens out hides real fade — so the verdict names which of the
two happened, and reports how many percentage points of the raw change the
terrain accounts for.

Use Cases:
- "Did I positive-split the long run, and how much of the slowdown was the hills?"
- Check race pacing discipline against a target even split
- Find the split where a workout came apart, rather than the lap where it was noticed

Parameters:
- activityId (required): The Strava activity to analyse
- unit (optional): "km" (default) or "mile"

Notes:
- Halves are cut at the exact midpoint of recorded distance, not by grouping
  splits, so an odd split count cannot skew the comparison
- Stopped time is excluded from pace via the moving stream; a trailing partial
  split is marked and left out of fastest/slowest
- Without an elevation or grade stream the terrain correction is unavailable and
  the response says so rather than implying an uncorrected verdict is corrected
`;

const inputSchema = z.object({
  activityId: stravaIdInput("The Strava activity to analyse."),
  unit: z
    .enum(["km", "mile"])
    .default("km")
    .describe("Split length: 'km' (default) or 'mile'."),
});

type GetSplitAnalysisInput = z.infer<typeof inputSchema>;

const STREAM_TYPES = [
  "time",
  "distance",
  "altitude",
  "grade_smooth",
  "heartrate",
  "velocity_smooth",
  "watts",
  "cadence",
  "moving",
] as const;

async function fetchStreams(
  token: string,
  activityId: number | string,
): Promise<Partial<SplitStreams>> {
  let streams: Awaited<ReturnType<typeof getActivityStreams>>;
  try {
    streams = await getActivityStreams(token, activityId, STREAM_TYPES);
  } catch (error) {
    // Only a genuinely sample-less activity degrades to the no-streams message
    // below; auth and rate-limit failures propagate so the user is told what to
    // fix instead of being told their GPS run is a manual entry.
    if (error instanceof StreamsUnavailableError) return {};
    throw error;
  }

  const result: Partial<SplitStreams> = {};
  for (const [type, data] of streams) {
    if (type === "moving") {
      result.moving = data as boolean[];
    } else if ((STREAM_TYPES as readonly string[]).includes(type)) {
      result[type as Exclude<keyof SplitStreams, "moving">] = data as number[];
    }
  }
  return result;
}

const formatPace = (secPerUnit: number | null, unit: SplitUnit) => {
  if (secPerUnit == null) return null;
  const minutes = Math.floor(secPerUnit / 60);
  const seconds = Math.round(secPerUnit % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /${unit}`;
};

function splitOut(split: Split, unit: SplitUnit, isRun: boolean) {
  return {
    split: split.index,
    start_m: split.startM,
    end_m: split.endM,
    distance_m: split.distanceM,
    partial: split.partial,
    moving_time_s: split.movingTimeS,
    elapsed_time_s: split.elapsedTimeS,
    pace_sec_per_unit: split.paceSecPerUnit,
    pace_formatted: formatPace(split.paceSecPerUnit, unit),
    gap_pace_sec_per_unit: split.gapPaceSecPerUnit,
    gap_pace_formatted: formatPace(split.gapPaceSecPerUnit, unit),
    elevation_change_m: split.elevationChangeM,
    avg_grade_pct: split.avgGradePct,
    avg_hr: split.avgHr,
    // Strava records run cadence per leg; display convention is doubled spm.
    avg_cadence:
      split.avgCadence != null
        ? Math.round(split.avgCadence * (isRun ? 2 : 1))
        : null,
    avg_watts: split.avgWatts,
  };
}

function splitLine(s: ReturnType<typeof splitOut>, unit: SplitUnit): string {
  const parts = [
    s.pace_formatted ?? "no pace",
    s.gap_pace_formatted && s.gap_pace_formatted !== s.pace_formatted
      ? `GAP ${s.gap_pace_formatted}`
      : null,
    s.elevation_change_m != null
      ? `${s.elevation_change_m >= 0 ? "+" : ""}${s.elevation_change_m} m`
      : null,
    s.avg_hr != null ? `${s.avg_hr} bpm` : null,
    s.avg_watts != null ? `${s.avg_watts} W` : null,
  ].filter(Boolean);
  // "3." for a full split, "0.62 km (partial)" for the trailing remainder,
  // whose pace is extrapolated and should not read like the others.
  const label = s.partial
    ? `${(s.distance_m / SPLIT_UNIT_METRES[unit]).toFixed(2)} ${unit} (partial)`
    : `${s.split}.`;
  return `  ${label.padEnd(4)} ${parts.join(", ")}`;
}

export const getSplitAnalysisTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: SplitAnalysisOutputSchema,
  execute: async (
    { activityId, unit }: GetSplitAnalysisInput,
    token: string,
  ) => {
    try {
      const [activity, streams] = await Promise.all([
        getActivityById(token, activityId),
        fetchStreams(token, activityId),
      ]);

      if (!streams.time || !streams.distance) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ No data streams are available for "${activity.name}" — manual activities have no recorded samples to split.`,
            },
          ],
          isError: true,
        };
      }

      const analysis = computeSplitAnalysis(streams as SplitStreams, { unit });
      const isRun = isRunningActivity(
        activity.sport_type || activity.type || "",
      );

      const structured = {
        activity_id: activityId,
        name: activity.name,
        date: activity.start_date_local,
        type: activity.sport_type || activity.type || "Unknown",
        unit: analysis.unit,
        verdict: analysis.verdict
          ? {
              shape: analysis.verdict.shape,
              gap_shape: analysis.verdict.gapShape,
              first_half_pace_sec_per_unit:
                analysis.verdict.firstHalfPaceSecPerUnit,
              second_half_pace_sec_per_unit:
                analysis.verdict.secondHalfPaceSecPerUnit,
              first_half_pace_formatted: formatPace(
                analysis.verdict.firstHalfPaceSecPerUnit,
                unit,
              ),
              second_half_pace_formatted: formatPace(
                analysis.verdict.secondHalfPaceSecPerUnit,
                unit,
              ),
              first_half_gap_pace_sec_per_unit:
                analysis.verdict.firstHalfGapPaceSecPerUnit,
              second_half_gap_pace_sec_per_unit:
                analysis.verdict.secondHalfGapPaceSecPerUnit,
              delta_pct: analysis.verdict.deltaPct,
              gap_delta_pct: analysis.verdict.gapDeltaPct,
              terrain_pct: analysis.verdict.terrainPct,
              first_half_elevation_change_m:
                analysis.verdict.firstHalfElevationChangeM,
              second_half_elevation_change_m:
                analysis.verdict.secondHalfElevationChangeM,
              interpretation: analysis.verdict.interpretation,
            }
          : null,
        splits: analysis.splits.map((split) => splitOut(split, unit, isRun)),
        fastest_split: analysis.fastestSplitIndex,
        slowest_split: analysis.slowestSplitIndex,
        totals: {
          distance_m: analysis.totals.distanceM,
          moving_time_s: analysis.totals.movingTimeS,
          elapsed_time_s: analysis.totals.elapsedTimeS,
          elevation_gain_m: analysis.totals.elevationGainM,
          avg_pace_sec_per_unit: analysis.totals.avgPaceSecPerUnit,
          avg_pace_formatted: formatPace(
            analysis.totals.avgPaceSecPerUnit,
            unit,
          ),
          avg_gap_pace_sec_per_unit: analysis.totals.avgGapPaceSecPerUnit,
        },
        warnings: analysis.warnings,
      };
      warnOnSchemaDrift(name, SplitAnalysisOutputSchema, structured);

      const distanceLabel = (
        analysis.totals.distanceM / SPLIT_UNIT_METRES[unit]
      ).toFixed(2);
      const lines = [
        `Split Analysis: ${activity.name} (${activity.start_date_local})`,
        `${distanceLabel} ${unit}, ${analysis.splits.length} splits, average ${structured.totals.avg_pace_formatted ?? "—"}`,
        "",
      ];

      const verdict = structured.verdict;
      if (verdict) {
        const sign = (value: number) => (value >= 0 ? "+" : "");
        lines.push(
          `Verdict: ${verdict.shape} split on the clock, ${verdict.gap_shape} grade-adjusted`,
          `  First half ${verdict.first_half_pace_formatted} → second half ${verdict.second_half_pace_formatted} (${sign(verdict.delta_pct)}${verdict.delta_pct}%)`,
        );
        if (verdict.gap_delta_pct != null) {
          lines.push(
            `  Grade-adjusted: ${sign(verdict.gap_delta_pct)}${verdict.gap_delta_pct}% (terrain accounts for ${sign(verdict.terrain_pct ?? 0)}${verdict.terrain_pct} points)`,
          );
        }
        lines.push(`  ${verdict.interpretation}`, "");
      }

      lines.push(`Splits (${unit}):`);
      for (const split of structured.splits) {
        lines.push(splitLine(split, unit));
      }
      if (structured.fastest_split != null) {
        lines.push(
          "",
          `Fastest split ${structured.fastest_split}, slowest split ${structured.slowest_split}`,
        );
      }

      if (structured.warnings.length > 0) lines.push("");
      for (const warning of structured.warnings) {
        lines.push(`Warning: ${warning}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof SplitAnalysisError) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error.message}` }],
          isError: true,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error in ${name}:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to compute split analysis: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
