import { z } from "zod";
import { stravaApi } from "../fetchClient";
import {
  computeIntervalAnalysis,
  IntervalAnalysisError,
  type IntervalLap,
  type IntervalStreams,
} from "../intervalAnalysis";
import {
  getActivityById,
  getActivityLaps as getActivityLapsClient,
  type StravaLap,
} from "../stravaClient";
import { formatDuration, isRunningActivity } from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { IntervalAnalysisOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-interval-analysis";

const description = `
Detects and analyses interval structure in one activity, with urban-stop-aware rest classification.

Naive rest-based interval detection false-positives on urban runs: traffic-light
stops read as recovery intervals. This tool classifies every stopped segment
(from the moving stream) before trusting it:
- Stop under 60 s with no fast effort before it → traffic light, excluded
- Stop up to 3 min after a fast effort → genuine interval recovery
- Stop over 5 min → café/regroup/kit stop, noted but excluded
- Anything else → unclassified, excluded (lowers confidence)

Work reps are reconstructed between recoveries (easy running is merged straight
through traffic lights) and reported with per-rep pace, HR, cadence, and power.
When the activity carries clean structured device laps those are preferred —
they also catch jog-recovery sessions, which never stop moving. Corrupted
auto-laps (rain/sweat) fail a consistency check and fall back to streams.

The response includes:
- A verdict (interval session or not) with confidence and a reasoning audit
  trail ("6 rests detected: 4 traffic lights, ...")
- Fade detection across reps (e.g. "rep 5 was 3% slower at 4 bpm higher HR than rep 1")
- An HR-distribution tiebreaker for "was this a workout at all"

Parameters:
- activityId (required): The Strava activity to analyse

Notes:
- Stream-based detection only sees boundaries where you actually stopped;
  jog-recovery workouts need laps (recorded automatically by most watches)
- Classification thresholds are documented above and deliberately conservative
`;

const inputSchema = z.object({
  activityId: stravaIdInput("The Strava activity to analyse."),
});

type GetIntervalAnalysisInput = z.infer<typeof inputSchema>;

const STREAM_TYPES = [
  "time",
  "distance",
  "moving",
  "heartrate",
  "velocity_smooth",
  "watts",
  "cadence",
] as const;

async function fetchStreams(
  token: string,
  activityId: number | string,
): Promise<Partial<IntervalStreams>> {
  try {
    const endpoint = `/activities/${activityId}/streams/${STREAM_TYPES.join(",")}`;
    const response = await stravaApi.get<
      Array<{ type: string; data: unknown[] }>
    >(endpoint, { headers: { Authorization: `Bearer ${token}` } });

    const result: Partial<IntervalStreams> = {};
    for (const stream of response.data) {
      if (stream.type === "moving") {
        result.moving = stream.data as boolean[];
      } else if ((STREAM_TYPES as readonly string[]).includes(stream.type)) {
        result[stream.type as Exclude<keyof IntervalStreams, "moving">] =
          stream.data as number[];
      }
    }
    return result;
  } catch {
    // Missing streams surface as an actionable analysis error below.
    return {};
  }
}

function toIntervalLap(lap: StravaLap): IntervalLap {
  return {
    lapIndex: lap.lap_index,
    distanceM: lap.distance,
    movingTimeS: lap.moving_time,
    avgSpeedMs: lap.average_speed ?? null,
    avgHr: lap.average_heartrate ?? null,
    avgCadence: lap.average_cadence ?? null,
    avgWatts: lap.average_watts ?? null,
  };
}

const formatPace = (secPerKm: number | null) => {
  if (secPerKm == null) return null;
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
};

export const getIntervalAnalysisTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: IntervalAnalysisOutputSchema,
  execute: async ({ activityId }: GetIntervalAnalysisInput) => {
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
      // Laps corrupt or go missing (rain, manual activities); their absence
      // must not fail the analysis, only remove the lap path.
      const [activity, streams, laps] = await Promise.all([
        getActivityById(token, activityId),
        fetchStreams(token, activityId),
        getActivityLapsClient(token, activityId).catch(() => []),
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

      const analysis = computeIntervalAnalysis(
        streams as IntervalStreams,
        laps.map(toIntervalLap),
      );
      const isRun = isRunningActivity(
        activity.sport_type || activity.type || "",
      );
      const cadenceUnit = isRun ? "spm" : "rpm";

      const structured = {
        activity_id: activityId,
        name: activity.name,
        date: activity.start_date_local,
        type: activity.sport_type || activity.type || "Unknown",
        is_intervals: analysis.isIntervals,
        source: analysis.source,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        reps: analysis.reps.map((rep) => ({
          index: rep.index,
          start_km: rep.startKm,
          distance_m: rep.distanceM,
          moving_time_s: rep.movingTimeS,
          moving_time_formatted: formatDuration(rep.movingTimeS),
          pace_sec_per_km: rep.paceSecPerKm,
          pace_formatted: formatPace(rep.paceSecPerKm),
          avg_hr: rep.avgHr,
          // Strava records run cadence per leg; display convention is spm.
          avg_cadence:
            rep.avgCadence != null
              ? Math.round(rep.avgCadence * (isRun ? 2 : 1))
              : null,
          avg_watts: rep.avgWatts,
        })),
        rests: analysis.rests.map((rest) => ({
          start_time_s: rest.startTimeS,
          at_km: rest.atKm,
          duration_s: rest.durationS,
          kind: rest.kind,
          reason: rest.reason,
        })),
        fade: analysis.fade
          ? {
              pace_drift_pct: analysis.fade.paceDriftPct,
              hr_drift_bpm: analysis.fade.hrDriftBpm,
              cadence_drift_pct: analysis.fade.cadenceDriftPct,
              summary: analysis.fade.summary,
            }
          : null,
        hr_signal: analysis.hrSignal
          ? {
              max_hr: analysis.hrSignal.maxHr,
              high_intensity_share_pct:
                Math.round(analysis.hrSignal.highIntensityShare * 1000) / 10,
              assessment: analysis.hrSignal.assessment,
            }
          : null,
        warnings: analysis.warnings,
      };
      warnOnSchemaDrift(name, IntervalAnalysisOutputSchema, structured);

      const lines = [
        `Interval Analysis: ${activity.name} (${activity.start_date_local})`,
        structured.is_intervals
          ? `Verdict: interval session — ${structured.reps.length} work reps (confidence: ${structured.confidence})`
          : `Verdict: not an interval session (confidence: ${structured.confidence})`,
        `Reasoning: ${structured.reasoning}`,
        "",
      ];

      if (structured.reps.length > 0) {
        lines.push("Reps:");
        for (const rep of structured.reps) {
          const parts = [
            `${rep.distance_m} m in ${rep.moving_time_formatted}`,
            rep.pace_formatted,
            rep.avg_hr != null ? `${rep.avg_hr} bpm` : null,
            rep.avg_cadence != null
              ? `${rep.avg_cadence} ${cadenceUnit}`
              : null,
            rep.avg_watts != null ? `${rep.avg_watts} W` : null,
          ].filter(Boolean);
          lines.push(`  ${rep.index}. km ${rep.start_km}: ${parts.join(", ")}`);
        }
        lines.push("");
      }

      if (structured.fade) {
        lines.push(`Fade: ${structured.fade.summary}`, "");
      }

      if (structured.rests.length > 0) {
        lines.push("Rests:");
        for (const rest of structured.rests) {
          lines.push(`  km ${rest.at_km}: ${rest.reason}`);
        }
        lines.push("");
      }

      if (structured.hr_signal) {
        lines.push(
          `HR signal: ${structured.hr_signal.assessment} (${structured.hr_signal.high_intensity_share_pct}% of moving time at ≥88% of max ${structured.hr_signal.max_hr} bpm)`,
        );
      }

      for (const warning of structured.warnings) {
        lines.push(`Warning: ${warning}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof IntervalAnalysisError) {
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
            text: `Failed to compute interval analysis: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
