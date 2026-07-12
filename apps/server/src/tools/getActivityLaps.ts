import { z } from "zod";
import {
  getActivityById,
  getActivityLaps as getActivityLapsClient,
  type StravaLap,
} from "../stravaClient";
import { formatDuration, metersPerSecToPace } from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { ActivityLapsOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-activity-laps";

const description = `
Retrieves the laps of a Strava activity with sport-appropriate formatting.

Runs report per-lap pace (min/km and min/mile, cadence in spm); rides and
other sports report speed (km/h), power when a meter was present, and
cadence in rpm. Works for any activity type with recorded laps — manual
laps, auto-laps, or structured-workout intervals.

Use Cases:
- Review interval workouts lap by lap (runs and rides)
- Compare effort across laps: pace/speed, HR, power, cadence, elevation
- Feed lap-level data into further analysis

Parameters:
- id (required): The unique identifier of the activity.

Notes:
- get-running-summary already embeds lap analysis for runs; this tool is the
  general-purpose version covering every sport
- Activities without laps return a graceful message
`;

const inputSchema = z.object({
  id: stravaIdInput("The identifier of the activity to fetch laps for."),
});

type GetActivityLapsInput = z.infer<typeof inputSchema>;

const RUNNING_TYPES = ["Run", "TrailRun", "VirtualRun"];

interface LapEntry {
  lap_index: number;
  name: string;
  distance_km: number;
  elapsed_time_seconds: number;
  elapsed_time_formatted: string;
  moving_time_seconds: number;
  moving_time_formatted: string;
  pace: { min_per_km: string; min_per_mile: string } | null;
  speed_kmh: number | null;
  average_watts: number | null;
  device_watts: boolean | null;
  average_cadence: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain_m: number | null;
}

/** Maps one raw lap to the structured entry. Exported for direct testing. */
export function mapLap(lap: StravaLap, isRun: boolean): LapEntry {
  const paceResult = metersPerSecToPace(lap.average_speed);
  return {
    lap_index: lap.lap_index,
    name: lap.name,
    distance_km: Math.round((lap.distance / 1000) * 100) / 100,
    elapsed_time_seconds: lap.elapsed_time,
    elapsed_time_formatted: formatDuration(lap.elapsed_time),
    moving_time_seconds: lap.moving_time,
    moving_time_formatted: formatDuration(lap.moving_time),
    pace:
      isRun && paceResult
        ? {
            min_per_km: paceResult.minPerKm,
            min_per_mile: paceResult.minPerMile,
          }
        : null,
    speed_kmh: !isRun && paceResult ? paceResult.kmh : null,
    average_watts: lap.average_watts ?? null,
    device_watts: lap.device_watts ?? null,
    // Strava reports running cadence as single-leg strides; double to spm.
    average_cadence:
      lap.average_cadence != null
        ? Math.round(lap.average_cadence * (isRun ? 2 : 1))
        : null,
    average_heartrate: lap.average_heartrate ?? null,
    max_heartrate: lap.max_heartrate ?? null,
    total_elevation_gain_m: lap.total_elevation_gain ?? null,
  };
}

function formatLapLine(entry: LapEntry, isRun: boolean): string {
  const parts = [
    `${entry.distance_km.toFixed(2)} km in ${entry.moving_time_formatted}`,
  ];
  if (entry.pace) parts.push(`${entry.pace.min_per_km} /km`);
  if (entry.speed_kmh != null) parts.push(`${entry.speed_kmh} km/h`);
  if (entry.average_watts != null) {
    parts.push(
      `${Math.round(entry.average_watts)} W${entry.device_watts ? "" : " (est)"}`,
    );
  }
  if (entry.average_heartrate != null) {
    const max = entry.max_heartrate != null ? `/${entry.max_heartrate}` : "";
    parts.push(`HR ${Math.round(entry.average_heartrate)}${max}`);
  }
  if (entry.average_cadence != null) {
    parts.push(`${entry.average_cadence} ${isRun ? "spm" : "rpm"}`);
  }
  if (entry.total_elevation_gain_m != null && entry.total_elevation_gain_m > 0)
    parts.push(`+${Math.round(entry.total_elevation_gain_m)} m`);
  return `  ${entry.lap_index}. ${parts.join(" · ")}`;
}

export const getActivityLapsTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: ActivityLapsOutputSchema,
  execute: async ({ id }: GetActivityLapsInput) => {
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
      console.error(`Fetching laps for activity ID: ${id}...`);

      // The activity detail supplies the sport (laps carry none) and is
      // usually already in the response cache.
      const [activity, laps] = await Promise.all([
        getActivityById(token, id),
        getActivityLapsClient(token, id),
      ]);

      if (laps.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ No laps recorded for activity ID: ${id}`,
            },
          ],
        };
      }

      const sportType = activity.sport_type ?? activity.type ?? "Workout";
      const isRun = RUNNING_TYPES.includes(sportType);
      const entries = [...laps]
        .sort((a, b) => a.lap_index - b.lap_index)
        .map((lap) => mapLap(lap, isRun));

      const response = {
        activity_id: String(activity.id),
        activity_name: activity.name,
        sport_type: sportType,
        lap_count: entries.length,
        laps: entries,
      };

      const emoji = isRun ? "🏃" : "🚴";
      const lines = [
        `${emoji} **Laps for "${activity.name}"** (${sportType}, ${entries.length} laps)`,
        "",
        ...entries.map((entry) => formatLapLine(entry, isRun)),
      ];

      warnOnSchemaDrift(
        "get-activity-laps",
        ActivityLapsOutputSchema,
        response,
      );

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: response,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching laps for activity ${id}: ${errorMessage}`);
      const userFriendlyMessage =
        errorMessage.includes("Record Not Found") ||
        errorMessage.includes("404")
          ? `Activity with ID ${id} not found.`
          : `An unexpected error occurred while fetching laps for activity ${id}. Details: ${errorMessage}`;
      return {
        content: [{ type: "text" as const, text: `❌ ${userFriendlyMessage}` }],
        isError: true,
      };
    }
  },
};
