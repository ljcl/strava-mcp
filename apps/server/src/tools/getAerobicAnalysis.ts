import { z } from "zod";
import {
  AerobicAnalysisError,
  computeAerobicAnalysis,
  interpretDecoupling,
} from "../aerobicAnalysis";
import { stravaApi } from "../fetchClient";
import { getActivityById, getAuthenticatedAthlete } from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { AerobicAnalysisOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-aerobic-analysis";

const description = `
Computes aerobic decoupling and efficiency metrics for one activity from its heart rate and power (or speed) streams.

Metrics:
- Aerobic decoupling: % drift of the output:HR ratio between the first and second half of the MOVING portion of the activity (power:HR when a power stream exists, speed:HR otherwise). Positive = the second half cost more heartbeats per watt — aerobic fatigue; negative = warmed into the effort.
- Efficiency factor (EF): normalized output per heartbeat (W/beat with power, metres-per-minute/beat with speed).
- Intensity factor (IF): normalized power / threshold power, when power and a threshold are available.

Interpretation bands: <+5% excellent, +5–10% moderate, >+10% over capacity for the duration, negative = gradual warm-up or negative split.

Use Cases:
- Judge long-run durability ("did the aerobic system hold up in the back half?")
- Compare the same steady route over time as fitness changes
- Sanity-check whether an easy run was actually easy

Parameters:
- activityId (required): The Strava activity to analyse
- excludeWarmupMinutes (optional, default 0): moving minutes dropped from the start before splitting halves — exclude a gradual warm-up to stop it reading as a benign negative drift
- thresholdPower (optional): threshold power in watts for IF; defaults to the FTP on the athlete's Strava profile when set

Notes:
- Stopped time (traffic lights, café stops) is excluded via the moving stream before halves are split
- Requires a heart rate stream; falls back from power to speed with a warning
- Works for any endurance activity with HR data, not just runs
`;

const inputSchema = z.object({
  activityId: stravaIdInput("The Strava activity to analyse."),
  excludeWarmupMinutes: z
    .number()
    .min(0)
    .max(120)
    .default(0)
    .describe(
      "Moving minutes to drop from the start before splitting halves (default 0). A gradual warm-up otherwise reads as benign negative decoupling.",
    ),
  thresholdPower: z
    .number()
    .positive()
    .optional()
    .describe(
      "Threshold power (FTP) in watts for the intensity factor. Defaults to the FTP on the athlete's Strava profile when set there.",
    ),
});

type GetAerobicAnalysisInput = z.infer<typeof inputSchema>;

/** Streams the analysis needs; `moving` is boolean, the rest numeric. */
interface AerobicStreamData {
  time?: number[];
  heartrate?: number[];
  watts?: number[];
  velocity_smooth?: number[];
  moving?: boolean[];
}

async function fetchStreams(
  token: string,
  activityId: number | string,
): Promise<AerobicStreamData> {
  const types = ["time", "heartrate", "watts", "velocity_smooth", "moving"];
  try {
    const endpoint = `/activities/${activityId}/streams/${types.join(",")}`;
    const response = await stravaApi.get<
      Array<{ type: string; data: unknown[] }>
    >(endpoint, { headers: { Authorization: `Bearer ${token}` } });

    const result: AerobicStreamData = {};
    for (const stream of response.data) {
      if (stream.type === "time") result.time = stream.data as number[];
      if (stream.type === "heartrate")
        result.heartrate = stream.data as number[];
      if (stream.type === "watts") result.watts = stream.data as number[];
      if (stream.type === "velocity_smooth")
        result.velocity_smooth = stream.data as number[];
      if (stream.type === "moving") result.moving = stream.data as boolean[];
    }
    return result;
  } catch {
    // Missing streams surface as an actionable analysis error below.
    return {};
  }
}

const round = (value: number, dp = 2) =>
  Math.round(value * 10 ** dp) / 10 ** dp;
const toMinutes = (seconds: number) => Math.round(seconds / 60);
const signed = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export const getAerobicAnalysisTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: AerobicAnalysisOutputSchema,
  execute: async ({
    activityId,
    excludeWarmupMinutes,
    thresholdPower,
  }: GetAerobicAnalysisInput) => {
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
      // The athlete profile is only needed for its FTP fallback; a failure
      // there must not fail the analysis.
      const [activity, streams, athlete] = await Promise.all([
        getActivityById(token, activityId),
        fetchStreams(token, activityId),
        thresholdPower == null
          ? getAuthenticatedAthlete(token).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!streams.time) {
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

      const resolvedThreshold = thresholdPower ?? athlete?.ftp ?? null;
      const analysis = computeAerobicAnalysis(
        {
          time: streams.time,
          heartrate: streams.heartrate,
          watts: streams.watts,
          velocity_smooth: streams.velocity_smooth,
          moving: streams.moving,
        },
        {
          excludeWarmupSeconds: (excludeWarmupMinutes ?? 0) * 60,
          thresholdPower: resolvedThreshold,
        },
      );

      const interpretation = interpretDecoupling(analysis.decouplingPct);
      const outputUnit = analysis.basis === "power" ? "W" : "m/s";
      const ratioUnit =
        analysis.basis === "power" ? "W/beat" : "m/min per beat";
      const ratioScale = analysis.basis === "power" ? 1 : 60;

      const structured = {
        activity_id: activityId,
        name: activity.name,
        date: activity.start_date_local,
        type: activity.sport_type || activity.type || "Unknown",
        basis: analysis.basis,
        decoupling_pct: round(analysis.decouplingPct, 1),
        interpretation,
        first_half: {
          avg_output: round(analysis.firstHalf.avgOutput),
          avg_hr: round(analysis.firstHalf.avgHeartrate, 0),
          output_per_beat: round(analysis.firstHalf.ratio * ratioScale, 3),
          minutes: toMinutes(analysis.firstHalf.seconds),
        },
        second_half: {
          avg_output: round(analysis.secondHalf.avgOutput),
          avg_hr: round(analysis.secondHalf.avgHeartrate, 0),
          output_per_beat: round(analysis.secondHalf.ratio * ratioScale, 3),
          minutes: toMinutes(analysis.secondHalf.seconds),
        },
        normalized_output: round(analysis.normalizedOutput),
        efficiency_factor: round(analysis.efficiencyFactor, 3),
        intensity_factor:
          analysis.intensityFactor != null
            ? round(analysis.intensityFactor, 3)
            : null,
        threshold_power_w: resolvedThreshold,
        moving_minutes: toMinutes(analysis.movingSeconds),
        excluded_stopped_minutes: toMinutes(analysis.excludedStoppedSeconds),
        excluded_warmup_minutes: toMinutes(analysis.excludedWarmupSeconds),
        warnings: analysis.warnings,
      };
      warnOnSchemaDrift(name, AerobicAnalysisOutputSchema, structured);

      const basisLabel =
        analysis.basis === "power" ? "power:HR (Pw:Hr)" : "speed:HR (Pa:Hr)";
      const lines = [
        `Aerobic Analysis: ${activity.name} (${activity.start_date_local})`,
        `Basis: ${basisLabel}`,
        "",
        `Decoupling: ${signed(analysis.decouplingPct)} — ${interpretation}`,
        `  First half:  ${structured.first_half.avg_output} ${outputUnit} @ ${structured.first_half.avg_hr} bpm (${structured.first_half.output_per_beat} ${ratioUnit})`,
        `  Second half: ${structured.second_half.avg_output} ${outputUnit} @ ${structured.second_half.avg_hr} bpm (${structured.second_half.output_per_beat} ${ratioUnit})`,
        "",
        analysis.basis === "power"
          ? `Normalized power: ${structured.normalized_output} W`
          : `Average moving speed: ${structured.normalized_output} m/s`,
        `Efficiency factor: ${structured.efficiency_factor} ${ratioUnit}`,
      ];
      if (structured.intensity_factor != null) {
        lines.push(
          `Intensity factor: ${structured.intensity_factor} (threshold ${resolvedThreshold} W)`,
        );
      }
      const exclusions = [
        structured.excluded_stopped_minutes > 0
          ? `${structured.excluded_stopped_minutes} min stopped`
          : null,
        structured.excluded_warmup_minutes > 0
          ? `${structured.excluded_warmup_minutes} min warm-up`
          : null,
      ].filter(Boolean);
      lines.push(
        `Analysed ${structured.moving_minutes} min of moving time${exclusions.length > 0 ? ` (excluded ${exclusions.join(", ")})` : ""}.`,
      );
      lines.push(
        "Bands: <+5% excellent, +5–10% moderate, >+10% over capacity; negative = warmed into it.",
      );
      for (const warning of analysis.warnings) {
        lines.push(`Warning: ${warning}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof AerobicAnalysisError) {
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
            text: `Failed to compute aerobic analysis: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
