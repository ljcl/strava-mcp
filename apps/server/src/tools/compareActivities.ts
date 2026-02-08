import { z } from "zod";
import { getActivityById, type StravaDetailedActivity } from "../stravaClient";
import {
  formatDuration,
  isRunningActivity,
  metersPerSecToPace,
  transformCadence,
} from "../utils/running";

const name = "compare-activities";

const description = `
Compares two running activities side-by-side.

This tool provides:
- Key metrics for both activities
- Calculated differences (pace, heart rate, cadence, etc.)
- Efficiency analysis comparing pace relative to heart rate

Use Cases:
- Compare the same route on different days
- Track fitness progress over time
- Analyze performance in different conditions
- Compare race efforts

Parameters:
- activityId1 (required): First activity ID (typically the baseline/older activity)
- activityId2 (required): Second activity ID (typically the comparison/newer activity)

Notes:
- Both activities should be running activities for meaningful comparison
- Efficiency analysis requires heart rate data in both activities
- Positive differences mean activity 2 is higher/longer
- Negative pace difference means activity 2 is faster
`;

const inputSchema = z.object({
  activityId1: z
    .number()
    .int()
    .positive()
    .describe("First activity ID (baseline/older activity)"),
  activityId2: z
    .number()
    .int()
    .positive()
    .describe("Second activity ID (comparison/newer activity)"),
});

type CompareActivitiesInput = z.infer<typeof inputSchema>;

interface ActivitySummary {
  id: number;
  name: string;
  date: string;
  type: string;
  distance_km: number;
  time_formatted: string;
  pace: {
    min_per_km: string;
    min_per_mile: string;
    raw_min_per_km: number;
  } | null;
  avg_hr: number | null;
  max_hr: number | null;
  cadence_spm: number | null;
  elevation_gain_m: number;
}

function extractActivitySummary(
  activity: StravaDetailedActivity,
): ActivitySummary {
  const pace = metersPerSecToPace(activity.average_speed);
  const cadence = transformCadence(activity.average_cadence, activity.type);

  return {
    id: activity.id,
    name: activity.name,
    date:
      activity.start_date_local?.split("T")[0] ??
      activity.start_date?.split("T")[0] ??
      "",
    type: activity.sport_type || activity.type,
    distance_km: Math.round((activity.distance || 0) / 10) / 100,
    time_formatted: formatDuration(activity.moving_time),
    pace: pace
      ? {
          min_per_km: pace.minPerKm,
          min_per_mile: pace.minPerMile,
          raw_min_per_km: pace.minPerKmRaw,
        }
      : null,
    avg_hr: activity.average_heartrate ?? null,
    max_hr: activity.max_heartrate ?? null,
    cadence_spm: cadence?.spm ?? null,
    elevation_gain_m: activity.total_elevation_gain ?? 0,
  };
}

export const compareActivitiesTool = {
  name,
  description,
  inputSchema,
  execute: async ({ activityId1, activityId2 }: CompareActivitiesInput) => {
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
      console.error(
        `Comparing activities ${activityId1} and ${activityId2}...`,
      );

      // Fetch both activities in parallel
      const [activity1, activity2] = await Promise.all([
        getActivityById(token, activityId1),
        getActivityById(token, activityId2),
      ]);

      // Warn if not running activities
      const isRunning1 = isRunningActivity(activity1.type);
      const isRunning2 = isRunningActivity(activity2.type);

      const warnings: string[] = [];
      if (!isRunning1) {
        warnings.push(
          `Activity 1 (${activity1.name}) is not a running activity (${activity1.type})`,
        );
      }
      if (!isRunning2) {
        warnings.push(
          `Activity 2 (${activity2.name}) is not a running activity (${activity2.type})`,
        );
      }

      // Extract summaries
      const summary1 = extractActivitySummary(activity1);
      const summary2 = extractActivitySummary(activity2);

      // Calculate differences (activity2 - activity1)
      const distanceDiff =
        Math.round((summary2.distance_km - summary1.distance_km) * 100) / 100;

      let paceDiff: { seconds_per_km: number; interpretation: string } | null =
        null;
      if (summary1.pace && summary2.pace) {
        const diffMinutes =
          summary2.pace.raw_min_per_km - summary1.pace.raw_min_per_km;
        const diffSeconds = Math.round(diffMinutes * 60);
        paceDiff = {
          seconds_per_km: diffSeconds,
          interpretation:
            diffSeconds < -5 ? "faster" : diffSeconds > 5 ? "slower" : "same",
        };
      }

      const hrDiff =
        summary1.avg_hr && summary2.avg_hr
          ? Math.round(summary2.avg_hr - summary1.avg_hr)
          : null;

      const cadenceDiff =
        summary1.cadence_spm && summary2.cadence_spm
          ? Math.round(summary2.cadence_spm - summary1.cadence_spm)
          : null;

      const elevationDiff = Math.round(
        summary2.elevation_gain_m - summary1.elevation_gain_m,
      );

      // Calculate efficiency (pace / HR - lower is better)
      let efficiency: {
        activity_1: number;
        activity_2: number;
        change_percent: number;
        interpretation: string;
        note: string;
      } | null = null;

      if (
        summary1.pace &&
        summary2.pace &&
        summary1.avg_hr &&
        summary2.avg_hr
      ) {
        const eff1 = (summary1.pace.raw_min_per_km / summary1.avg_hr) * 100;
        const eff2 = (summary2.pace.raw_min_per_km / summary2.avg_hr) * 100;
        const changePercent = Math.round(((eff2 - eff1) / eff1) * 1000) / 10;

        efficiency = {
          activity_1: Math.round(eff1 * 1000) / 1000,
          activity_2: Math.round(eff2 * 1000) / 1000,
          change_percent: changePercent,
          interpretation:
            changePercent < -3
              ? "improved"
              : changePercent > 3
                ? "declined"
                : "unchanged",
          note: "Lower efficiency number = faster pace at same heart rate = better fitness",
        };
      }

      const result = {
        activity_1: summary1,
        activity_2: summary2,
        differences: {
          distance_km: distanceDiff,
          pace: paceDiff,
          avg_hr: hrDiff,
          cadence_spm: cadenceDiff,
          elevation_gain_m: elevationDiff,
        },
        efficiency,
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      // Format as readable text
      let output = `📊 **Activity Comparison**\n\n`;

      output += `**Activity 1: ${summary1.name}**\n`;
      output += `  📅 ${summary1.date} | ${summary1.type}\n`;
      output += `  📏 ${summary1.distance_km} km in ${summary1.time_formatted}\n`;
      if (summary1.pace)
        output += `  ⏱️ Pace: ${summary1.pace.min_per_km} /km\n`;
      if (summary1.avg_hr)
        output += `  ❤️ HR: ${summary1.avg_hr} avg, ${summary1.max_hr} max\n`;
      if (summary1.cadence_spm)
        output += `  👟 Cadence: ${summary1.cadence_spm} spm\n`;
      output += `  ⛰️ Elevation: ${summary1.elevation_gain_m} m\n\n`;

      output += `**Activity 2: ${summary2.name}**\n`;
      output += `  📅 ${summary2.date} | ${summary2.type}\n`;
      output += `  📏 ${summary2.distance_km} km in ${summary2.time_formatted}\n`;
      if (summary2.pace)
        output += `  ⏱️ Pace: ${summary2.pace.min_per_km} /km\n`;
      if (summary2.avg_hr)
        output += `  ❤️ HR: ${summary2.avg_hr} avg, ${summary2.max_hr} max\n`;
      if (summary2.cadence_spm)
        output += `  👟 Cadence: ${summary2.cadence_spm} spm\n`;
      output += `  ⛰️ Elevation: ${summary2.elevation_gain_m} m\n\n`;

      output += `**Differences (Activity 2 vs Activity 1)**\n`;
      output += `  Distance: ${distanceDiff > 0 ? "+" : ""}${distanceDiff} km\n`;
      if (paceDiff) {
        const sign = paceDiff.seconds_per_km > 0 ? "+" : "";
        output += `  Pace: ${sign}${paceDiff.seconds_per_km} sec/km (${paceDiff.interpretation})\n`;
      }
      if (hrDiff !== null)
        output += `  Avg HR: ${hrDiff > 0 ? "+" : ""}${hrDiff} bpm\n`;
      if (cadenceDiff !== null)
        output += `  Cadence: ${cadenceDiff > 0 ? "+" : ""}${cadenceDiff} spm\n`;
      output += `  Elevation: ${elevationDiff > 0 ? "+" : ""}${elevationDiff} m\n\n`;

      if (efficiency) {
        output += `**Efficiency Analysis**\n`;
        output += `  Activity 1: ${efficiency.activity_1}\n`;
        output += `  Activity 2: ${efficiency.activity_2}\n`;
        output += `  Change: ${efficiency.change_percent > 0 ? "+" : ""}${efficiency.change_percent}% (${efficiency.interpretation})\n`;
        output += `  ℹ️ ${efficiency.note}\n\n`;
      }

      if (warnings.length > 0) {
        output += `**⚠️ Warnings**\n`;
        for (const w of warnings) {
          output += `  - ${w}\n`;
        }
      }

      console.error(
        `Successfully compared activities ${activityId1} and ${activityId2}`,
      );

      return {
        content: [
          { type: "text" as const, text: output },
          {
            type: "text" as const,
            text: `\n**Raw Data:**\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error comparing activities: ${errorMessage}`);

      const userFriendlyMessage =
        errorMessage.includes("Record Not Found") ||
        errorMessage.includes("404")
          ? `One or both activities not found. Please verify the activity IDs.`
          : `An unexpected error occurred while comparing activities. Details: ${errorMessage}`;

      return {
        content: [{ type: "text" as const, text: `❌ ${userFriendlyMessage}` }],
        isError: true,
      };
    }
  },
};
