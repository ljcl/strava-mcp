import { z } from "zod";
import { stravaApi } from "../fetchClient";
import {
  getActivityById,
  getActivityLaps,
  getAthleteZones,
} from "../stravaClient";
import {
  assessCadence,
  computeTimeInZones,
  formatDuration,
  isRunningActivity,
  metersPerSecToPace,
  transformCadence,
  type ZoneBoundary,
} from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { RunningSummaryOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-running-summary";

const description = `
Retrieves a comprehensive running-focused summary of a Strava activity.

This tool combines data from multiple sources and computes derived metrics specifically for running analysis:
- Pace in min/km and min/mile (not just speed)
- Cadence as steps per minute (doubled from Strava's strides)
- Heart rate zone distribution computed from HR stream
- Per-lap breakdown with running-specific metrics

Use Cases:
- Get a complete picture of a run in a single call
- Analyze heart rate zone distribution
- Review lap-by-lap performance with pace data
- Assess cadence efficiency

Parameters:
- activityId (required): The unique identifier of the Strava activity

Notes:
- Returns an error if the activity is not a running type
- Heart rate zones require the athlete to have zones configured in Strava
- Zone distribution requires HR stream data to be available
`;

const inputSchema = z.object({
  activityId: stravaIdInput(
    "The unique identifier of the running activity to analyze.",
  ),
});

type GetRunningSummaryInput = z.infer<typeof inputSchema>;

// Stream types we need for running analysis
type StreamData = {
  time?: number[];
  heartrate?: number[];
  cadence?: number[];
  velocity_smooth?: number[];
};

async function fetchStreams(
  token: string,
  activityId: number | string,
): Promise<StreamData> {
  const streamTypes = ["time", "heartrate", "cadence", "velocity_smooth"];

  try {
    const endpoint = `/activities/${activityId}/streams/${streamTypes.join(",")}`;
    const response = await stravaApi.get(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const streams = response.data as Array<{ type: string; data: number[] }>;
    const result: StreamData = {};

    for (const stream of streams) {
      if (stream.type === "time") result.time = stream.data;
      if (stream.type === "heartrate") result.heartrate = stream.data;
      if (stream.type === "cadence") result.cadence = stream.data;
      if (stream.type === "velocity_smooth")
        result.velocity_smooth = stream.data;
    }

    return result;
  } catch {
    // Streams may not be available for all activities
    return {};
  }
}

export const getRunningSummaryTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: RunningSummaryOutputSchema,
  execute: async ({ activityId }: GetRunningSummaryInput) => {
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
        `Fetching running summary for activity ID: ${activityId}...`,
      );

      // Fetch all data in parallel
      const [activity, laps, streams, zones] = await Promise.all([
        getActivityById(token, activityId),
        getActivityLaps(token, activityId),
        fetchStreams(token, activityId),
        getAthleteZones(token).catch(() => null), // Zones may require special permissions
      ]);

      // Validate this is a running activity
      if (!isRunningActivity(activity.type)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Activity "${activity.name}" is not a running activity (type: ${activity.type}). This tool is designed for running analysis.`,
            },
          ],
          isError: true,
        };
      }

      // Transform core metrics
      const pace = metersPerSecToPace(activity.average_speed);
      const cadence = transformCadence(activity.average_cadence, activity.type);
      const cadenceAssessment = cadence?.spm
        ? assessCadence(cadence.spm)
        : null;

      // Compute time in zones if HR data available
      let hrZones = null;
      if (streams.time && streams.heartrate && zones?.heart_rate?.zones) {
        const zoneBoundaries: ZoneBoundary[] = zones.heart_rate.zones.map(
          (zone) => ({
            min: zone.min,
            max: zone.max ?? 999,
          }),
        );
        hrZones = computeTimeInZones(
          streams.heartrate,
          streams.time,
          zoneBoundaries,
        );
      }

      // Format laps with running metrics
      const formattedLaps = laps.map((lap) => {
        const lapPace = metersPerSecToPace(lap.average_speed);
        const lapCadence = transformCadence(lap.average_cadence, activity.type);

        return {
          lap: lap.lap_index,
          name: lap.name || `Lap ${lap.lap_index}`,
          distance_km: Math.round((lap.distance / 1000) * 100) / 100,
          time: formatDuration(lap.moving_time),
          pace: lapPace
            ? { min_per_km: lapPace.minPerKm, min_per_mile: lapPace.minPerMile }
            : null,
          cadence_spm: lapCadence?.spm ?? null,
          avg_hr: lap.average_heartrate ?? null,
          max_hr: lap.max_heartrate ?? null,
          elevation_gain_m: lap.total_elevation_gain ?? null,
        };
      });

      // Build the summary object
      const summary = {
        activity_id: activityId,
        name: activity.name,
        date: activity.start_date_local,
        type: activity.sport_type || activity.type,

        distance: {
          meters: activity.distance ?? 0,
          km: Math.round((activity.distance ?? 0) / 10) / 100,
          miles: Math.round((activity.distance ?? 0) / 16.0934) / 100,
        },

        time: {
          moving_seconds: activity.moving_time ?? 0,
          moving_formatted: formatDuration(activity.moving_time),
          elapsed_seconds: activity.elapsed_time ?? 0,
          elapsed_formatted: formatDuration(activity.elapsed_time),
        },

        pace: pace
          ? {
              min_per_km: pace.minPerKm,
              min_per_mile: pace.minPerMile,
              display: pace.display,
            }
          : null,

        elevation: {
          gain_m: activity.total_elevation_gain ?? 0,
          gain_ft: Math.round((activity.total_elevation_gain ?? 0) * 3.281),
        },

        cadence: cadence
          ? {
              average_spm: cadence.spm,
              assessment: cadenceAssessment,
            }
          : null,

        heart_rate:
          activity.average_heartrate || activity.max_heartrate
            ? {
                average: activity.average_heartrate ?? null,
                max: activity.max_heartrate ?? null,
                zones: hrZones,
              }
            : null,

        power:
          activity.device_watts && activity.average_watts
            ? {
                average_watts: activity.average_watts,
                max_watts: activity.max_watts ?? null,
              }
            : null,

        laps: formattedLaps,

        gear: activity.gear?.name ?? null,
      };

      // Format as readable text output
      let output = `🏃 **Running Summary: ${summary.name}**\n`;
      output += `📅 ${new Date(summary.date).toLocaleString()}\n\n`;

      output += `**Distance & Time**\n`;
      output += `  Distance: ${summary.distance.km} km (${summary.distance.miles} mi)\n`;
      output += `  Moving Time: ${summary.time.moving_formatted}\n`;
      output += `  Elapsed Time: ${summary.time.elapsed_formatted}\n\n`;

      if (summary.pace) {
        output += `**Pace**\n`;
        output += `  Average: ${summary.pace.min_per_km} /km (${summary.pace.min_per_mile} /mi)\n\n`;
      }

      if (summary.elevation.gain_m > 0) {
        output += `**Elevation**\n`;
        output += `  Gain: ${summary.elevation.gain_m} m (${summary.elevation.gain_ft} ft)\n\n`;
      }

      if (summary.cadence) {
        output += `**Cadence**\n`;
        output += `  Average: ${summary.cadence.average_spm} spm`;
        if (summary.cadence.assessment) {
          output += ` (${summary.cadence.assessment})`;
        }
        output += `\n\n`;
      }

      if (summary.heart_rate) {
        output += `**Heart Rate**\n`;
        if (summary.heart_rate.average)
          output += `  Average: ${summary.heart_rate.average} bpm\n`;
        if (summary.heart_rate.max)
          output += `  Max: ${summary.heart_rate.max} bpm\n`;

        if (summary.heart_rate.zones) {
          output += `  Zone Distribution:\n`;
          const zn = summary.heart_rate.zones.zones;
          output += `    Zone 1: ${zn.zone_1.formatted} (${zn.zone_1.percentage}%)\n`;
          output += `    Zone 2: ${zn.zone_2.formatted} (${zn.zone_2.percentage}%)\n`;
          output += `    Zone 3: ${zn.zone_3.formatted} (${zn.zone_3.percentage}%)\n`;
          output += `    Zone 4: ${zn.zone_4.formatted} (${zn.zone_4.percentage}%)\n`;
          output += `    Zone 5: ${zn.zone_5.formatted} (${zn.zone_5.percentage}%)\n`;
          const d = summary.heart_rate.zones.distribution;
          output += `  Summary: Easy ${d.easy_1_2}% | Moderate ${d.moderate_3}% | Hard ${d.hard_4_5}%\n`;
        }
        output += `\n`;
      }

      if (summary.power) {
        output += `**Power**\n`;
        output += `  Average: ${summary.power.average_watts} W\n`;
        if (summary.power.max_watts)
          output += `  Max: ${summary.power.max_watts} W\n`;
        output += `\n`;
      }

      if (summary.laps.length > 0) {
        output += `**Laps (${summary.laps.length})**\n`;
        for (const lap of summary.laps) {
          output += `  ${lap.lap}: ${lap.distance_km} km in ${lap.time}`;
          if (lap.pace) output += ` @ ${lap.pace.min_per_km} /km`;
          if (lap.cadence_spm) output += ` | ${lap.cadence_spm} spm`;
          if (lap.avg_hr) output += ` | ${lap.avg_hr} bpm`;
          output += `\n`;
        }
        output += `\n`;
      }

      if (summary.gear) {
        output += `**Gear**: ${summary.gear}\n`;
      }

      console.error(
        `Successfully generated running summary for: ${activity.name}`,
      );

      warnOnSchemaDrift(
        "get-running-summary",
        RunningSummaryOutputSchema,
        summary,
      );

      return {
        content: [{ type: "text" as const, text: output }],
        structuredContent: summary,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Error generating running summary for ${activityId}: ${errorMessage}`,
      );

      const userFriendlyMessage =
        errorMessage.includes("Record Not Found") ||
        errorMessage.includes("404")
          ? `Activity with ID ${activityId} not found.`
          : `An unexpected error occurred while generating running summary. Details: ${errorMessage}`;

      return {
        content: [{ type: "text" as const, text: `❌ ${userFriendlyMessage}` }],
        isError: true,
      };
    }
  },
};
