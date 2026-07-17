import { z } from "zod";
import { stravaApi } from "../fetchClient";
import {
  computeHillAnalysis,
  HillAnalysisError,
  type HillSegment,
  type HillStreams,
} from "../hillAnalysis";
import { getActivityById } from "../stravaClient";
import { isRunningActivity } from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { HillAnalysisOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-hill-analysis";

const description = `
Analyses climbing and descending performance within one activity from its elevation, grade, and pace streams.

This tool detects sustained climbs (grade ≥ 2% for ≥ 200 m, dip-tolerant) and descents, and reports per segment:
- Start km, length, average grade, elevation gain
- Moving pace and grade-adjusted (GAP, flat-equivalent) pace
- Average HR, cadence, and power where recorded

The headline output is early-vs-late climb drift: climb effort is normalised
as HR per unit of grade-adjusted speed, then climbs starting in the first
half of the run are compared with climbs in the second half. Positive drift =
the same climbing cost more late in the run (late-race hill fatigue).
Without HR the drift falls back to grade-adjusted pace alone.

Use Cases:
- "Did I fade on the climbs in the back third of my long run?"
- Check descent handling (pace and cadence on downhills) for eccentric-load management
- Compare hilly-course readiness across key long runs

Parameters:
- activityId (required): The Strava activity to analyse

Notes:
- Elevation is Strava's corrected elevation stream, not raw barometric values
- Works without power (HR + GAP) and without HR (GAP-pace drift only)
- Stopped time is excluded from segment pace via the moving stream
`;

const inputSchema = z.object({
  activityId: stravaIdInput("The Strava activity to analyse."),
});

type GetHillAnalysisInput = z.infer<typeof inputSchema>;

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
): Promise<Partial<HillStreams>> {
  try {
    const endpoint = `/activities/${activityId}/streams/${STREAM_TYPES.join(",")}`;
    const response = await stravaApi.get<
      Array<{ type: string; data: unknown[] }>
    >(endpoint, { headers: { Authorization: `Bearer ${token}` } });

    const result: Partial<HillStreams> = {};
    for (const stream of response.data) {
      if (stream.type === "moving") {
        result.moving = stream.data as boolean[];
      } else if ((STREAM_TYPES as readonly string[]).includes(stream.type)) {
        result[stream.type as Exclude<keyof HillStreams, "moving">] =
          stream.data as number[];
      }
    }
    return result;
  } catch {
    // Missing streams surface as an actionable analysis error below.
    return {};
  }
}

const formatPace = (secPerKm: number | null) => {
  if (secPerKm == null) return null;
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
};

function segmentOut(segment: HillSegment, isRun: boolean) {
  return {
    start_km: segment.startKm,
    end_km: segment.endKm,
    length_m: segment.lengthM,
    elevation_change_m: segment.elevationChangeM,
    avg_grade_pct: segment.avgGradePct,
    moving_time_s: segment.movingTimeS,
    pace_sec_per_km: segment.paceSecPerKm,
    pace_formatted: formatPace(segment.paceSecPerKm),
    gap_pace_sec_per_km: segment.gapPaceSecPerKm,
    gap_pace_formatted: formatPace(segment.gapPaceSecPerKm),
    avg_hr: segment.avgHr,
    // Strava records run cadence per leg; display convention is doubled spm.
    avg_cadence:
      segment.avgCadence != null
        ? isRun
          ? Math.round(segment.avgCadence * 2)
          : Math.round(segment.avgCadence)
        : null,
    avg_watts: segment.avgWatts,
    hr_per_gap_speed: segment.hrPerGapSpeed,
  };
}

function segmentLine(s: ReturnType<typeof segmentOut>): string {
  const parts = [
    `km ${s.start_km}–${s.end_km}`,
    `${s.length_m} m @ ${s.avg_grade_pct}%`,
    `${s.elevation_change_m >= 0 ? "+" : ""}${s.elevation_change_m} m`,
    s.pace_formatted ? `pace ${s.pace_formatted}` : null,
    s.gap_pace_formatted ? `GAP ${s.gap_pace_formatted}` : null,
    s.avg_hr != null ? `${s.avg_hr} bpm` : null,
    s.avg_watts != null ? `${s.avg_watts} W` : null,
  ].filter(Boolean);
  return `  ${parts.join(", ")}`;
}

export const getHillAnalysisTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: HillAnalysisOutputSchema,
  execute: async ({ activityId }: GetHillAnalysisInput) => {
    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
      console.error("Missing STRAVA_ACCESS_TOKEN environment variable.");
      return {
        content: [
          {
            type: "text" as const,
            text: "Configuration error: Missing Strava access token.",
          },
        ],
        isError: true,
      };
    }

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
              text: `No data streams are available for "${activity.name}" — manual activities have no recorded samples to analyse.`,
            },
          ],
          isError: true,
        };
      }

      const analysis = computeHillAnalysis(streams as HillStreams);
      const isRun = isRunningActivity(
        activity.sport_type || activity.type || "",
      );

      const structured = {
        activity_id: activityId,
        name: activity.name,
        date: activity.start_date_local,
        type: activity.sport_type || activity.type || "Unknown",
        drift: analysis.drift
          ? {
              basis: analysis.drift.basis,
              early_value: analysis.drift.earlyValue,
              late_value: analysis.drift.lateValue,
              drift_pct: analysis.drift.driftPct,
              early_climbs: analysis.drift.earlyClimbs,
              late_climbs: analysis.drift.lateClimbs,
            }
          : null,
        climbs: analysis.climbs.map((c) => segmentOut(c, isRun)),
        descents: analysis.descents.map((d) => segmentOut(d, isRun)),
        totals: {
          climb_count: analysis.totals.climbCount,
          descent_count: analysis.totals.descentCount,
          climb_distance_m: analysis.totals.climbDistanceM,
          climb_gain_m: analysis.totals.climbGainM,
        },
        warnings: analysis.warnings,
      };
      warnOnSchemaDrift(name, HillAnalysisOutputSchema, structured);

      const lines = [
        `Hill Analysis: ${activity.name} (${activity.start_date_local})`,
        `${structured.totals.climb_count} climbs (${structured.totals.climb_distance_m} m, +${structured.totals.climb_gain_m} m), ${structured.totals.descent_count} descents`,
        "",
      ];

      if (structured.drift) {
        const d = structured.drift;
        const basisLabel =
          d.basis === "hr_per_gap"
            ? "HR per grade-adjusted speed"
            : "grade-adjusted pace (no HR)";
        const sign = d.drift_pct >= 0 ? "+" : "";
        lines.push(
          `Late-vs-early climb drift: ${sign}${d.drift_pct}% (${basisLabel})`,
          `  Early climbs (${d.early_climbs}): ${d.early_value} → late climbs (${d.late_climbs}): ${d.late_value}`,
          d.drift_pct > 5
            ? `  Climbing cost noticeably more late in the run — late-race hill fatigue.`
            : d.drift_pct < -5
              ? `  Late climbs were cheaper — warmed into the run or paced conservatively early.`
              : `  Climb cost held steady across the run.`,
          "",
        );
      }

      if (structured.climbs.length > 0) {
        lines.push(`Climbs:`);
        for (const c of structured.climbs) {
          lines.push(segmentLine(c));
        }
        lines.push("");
      }

      if (structured.descents.length > 0) {
        lines.push(`Descents:`);
        for (const d of structured.descents) {
          const cadence =
            d.avg_cadence != null
              ? `, cadence ${d.avg_cadence} ${isRun ? "spm" : "rpm"}`
              : "";
          lines.push(`${segmentLine(d)}${cadence}`);
        }
        lines.push("");
      }

      for (const warning of structured.warnings) {
        lines.push(`Warning: ${warning}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof HillAnalysisError) {
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
            text: `Failed to compute hill analysis: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
