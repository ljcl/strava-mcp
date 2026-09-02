import { z } from "zod";
import {
  getAthleteStats as fetchAthleteStats,
  getAuthenticatedAthlete,
  type StravaStats,
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import { stravaIdInput } from "./_ids";
import { AthleteStatsOutputSchema, buildAthleteStatsOutput } from "./outputs";

// Input schema: athleteId is optional and defaults to the authenticated athlete.
const GetAthleteStatsInputSchema = z.object({
  athleteId: stravaIdInput(
    "Optional. The unique identifier of the athlete to fetch stats for. Defaults to the authenticated athlete when omitted (Strava only returns meaningful totals for the authenticated athlete).",
  ).optional(),
});

// Define type alias for input
type GetAthleteStatsInput = z.infer<typeof GetAthleteStatsInputSchema>;

// Helper function to format numbers as strings with labels (metric)
function formatStat(
  value: number | null | undefined,
  unit: "km" | "m" | "hrs",
): string {
  if (value === null || value === undefined) return "N/A";

  let formattedValue: string;
  if (unit === "km") {
    formattedValue = (value / 1000).toFixed(2);
  } else if (unit === "m") {
    formattedValue = Math.round(value).toString();
  } else if (unit === "hrs") {
    formattedValue = (value / 3600).toFixed(1);
  } else {
    formattedValue = value.toString();
  }
  return `${formattedValue} ${unit}`;
}

// Format athlete stats (metric only)
function formatStats(stats: StravaStats): string {
  const format = (
    label: string,
    total: number | null | undefined,
    unit: "km" | "m" | "hrs",
    count?: number | null,
    time?: number | null,
  ) => {
    let line = `   - ${label}: ${formatStat(total, unit)}`;
    if (count !== undefined && count !== null) line += ` (${count} activities)`;
    if (time !== undefined && time !== null)
      line += ` / ${formatStat(time, "hrs")} hours`;
    return line;
  };

  let response = "📊 **Your Strava Stats:**\n";

  if (stats.biggest_ride_distance !== undefined) {
    response += "**Rides:**\n";
    response += `${format("Biggest Ride", stats.biggest_ride_distance, "km")}\n`;
  }
  if (stats.recent_ride_totals) {
    response += "*Recent Rides (last 4 weeks):*\n";
    response += `${format(
      "Distance",
      stats.recent_ride_totals.distance,
      "km",
      stats.recent_ride_totals.count,
      stats.recent_ride_totals.moving_time,
    )}\n`;
    response += `${format("Elevation Gain", stats.recent_ride_totals.elevation_gain, "m")}\n`;
  }
  if (stats.ytd_ride_totals) {
    response += "*Year-to-Date Rides:*\n";
    response += `${format(
      "Distance",
      stats.ytd_ride_totals.distance,
      "km",
      stats.ytd_ride_totals.count,
      stats.ytd_ride_totals.moving_time,
    )}\n`;
    response += `${format("Elevation Gain", stats.ytd_ride_totals.elevation_gain, "m")}\n`;
  }
  if (stats.all_ride_totals) {
    response += "*All-Time Rides:*\n";
    response += `${format(
      "Distance",
      stats.all_ride_totals.distance,
      "km",
      stats.all_ride_totals.count,
      stats.all_ride_totals.moving_time,
    )}\n`;
    response += `${format("Elevation Gain", stats.all_ride_totals.elevation_gain, "m")}\n`;
  }

  // Similar blocks for Runs and Swims if needed...
  if (stats.recent_run_totals || stats.ytd_run_totals || stats.all_run_totals) {
    response += "\n**Runs:**\n";
    if (stats.recent_run_totals) {
      response += "*Recent Runs (last 4 weeks):*\n";
      response += `${format(
        "Distance",
        stats.recent_run_totals.distance,
        "km",
        stats.recent_run_totals.count,
        stats.recent_run_totals.moving_time,
      )}\n`;
      response += `${format("Elevation Gain", stats.recent_run_totals.elevation_gain, "m")}\n`;
    }
    if (stats.ytd_run_totals) {
      response += "*Year-to-Date Runs:*\n";
      response += `${format(
        "Distance",
        stats.ytd_run_totals.distance,
        "km",
        stats.ytd_run_totals.count,
        stats.ytd_run_totals.moving_time,
      )}\n`;
      response += `${format("Elevation Gain", stats.ytd_run_totals.elevation_gain, "m")}\n`;
    }
    if (stats.all_run_totals) {
      response += "*All-Time Runs:*\n";
      response += `${format(
        "Distance",
        stats.all_run_totals.distance,
        "km",
        stats.all_run_totals.count,
        stats.all_run_totals.moving_time,
      )}\n`;
      response += `${format("Elevation Gain", stats.all_run_totals.elevation_gain, "m")}\n`;
    }
  }

  // Add Swims similarly if needed

  return response;
}

// Tool definition
export const getAthleteStatsTool = {
  name: "get-athlete-stats",
  description:
    "Fetches the activity statistics (recent, YTD, all-time) for an athlete. Defaults to the authenticated athlete; pass athleteId to target a specific athlete.",
  inputSchema: GetAthleteStatsInputSchema,
  outputSchema: AthleteStatsOutputSchema,
  annotations: READ_ONLY,
  execute: async ({ athleteId }: GetAthleteStatsInput, token: string) => {
    let resolvedAthleteId = athleteId;

    try {
      if (resolvedAthleteId === undefined) {
        console.error(
          "No athleteId provided; resolving authenticated athlete...",
        );
        const athlete = await getAuthenticatedAthlete(token);
        // Athlete ids are normalised to strings by the client schemas; pass
        // through untouched so oversized ids stay exact.
        resolvedAthleteId = athlete.id;
      }

      console.error(`Fetching stats for athlete ${resolvedAthleteId}...`);
      const stats = await fetchAthleteStats(token, resolvedAthleteId);
      const formattedStats = formatStats(stats);

      console.error(
        `Successfully fetched stats for athlete ${resolvedAthleteId}.`,
      );
      return {
        content: [{ type: "text" as const, text: formattedStats }],
        structuredContent: buildAthleteStatsOutput(stats),
      };
    } catch (error) {
      const athleteLabel =
        resolvedAthleteId !== undefined
          ? `athlete ${resolvedAthleteId}`
          : "the authenticated athlete";
      return {
        content: [
          {
            type: "text" as const,
            text: toolErrorText(error, {
              context: `fetch stats for ${athleteLabel}`,
              notFound: `Athlete ${resolvedAthleteId !== undefined ? `with ID ${resolvedAthleteId} ` : ""}not found (when fetching stats).`,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
