import { z } from "zod";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
} from "../formatters";
import {
  getActivityById as fetchActivityById,
  type StravaDetailedActivity, // Type needed for formatter
} from "../stravaClient";
import {
  isRunningActivity,
  metersPerSecToPace,
  transformCadence,
} from "../utils/running";

// Zod schema for input validation
const GetActivityDetailsInputSchema = z.object({
  activityId: z
    .number()
    .int()
    .positive()
    .describe("The unique identifier of the activity to fetch details for."),
});

type GetActivityDetailsInput = z.infer<typeof GetActivityDetailsInputSchema>;

// Format activity details (Metric Only)
function formatActivityDetails(activity: StravaDetailedActivity): string {
  const date = new Date(activity.start_date_local).toLocaleString();
  const movingTime = formatDuration(activity.moving_time);
  const elapsedTime = formatDuration(activity.elapsed_time);
  const distance = formatDistance(activity.distance);
  const elevation = formatElevation(activity.total_elevation_gain);
  const avgSpeed = formatSpeed(activity.average_speed);
  const maxSpeed = formatSpeed(activity.max_speed);

  // Running-specific transformations
  const isRunning = isRunningActivity(activity.type);
  const pace = metersPerSecToPace(activity.average_speed);
  const cadence = transformCadence(activity.average_cadence, activity.type);

  let details = `🏃 **${activity.name}** (ID: ${activity.id})\n`;
  details += `   - Type: ${activity.type} (${activity.sport_type})\n`;
  details += `   - Date: ${date}\n`;
  details += `   - Moving Time: ${movingTime}, Elapsed Time: ${elapsedTime}\n`;
  if (activity.distance !== undefined)
    details += `   - Distance: ${distance}\n`;
  if (activity.total_elevation_gain !== undefined)
    details += `   - Elevation Gain: ${elevation}\n`;

  // Show pace for running activities, speed for others
  if (activity.average_speed !== undefined) {
    if (isRunning && pace) {
      details += `   - Pace: ${pace.minPerKm} /km (${pace.minPerMile} /mi)\n`;
      details += `   - Average Speed: ${avgSpeed}\n`;
    } else {
      details += `   - Average Speed: ${avgSpeed}\n`;
    }
  }
  if (activity.max_speed !== undefined)
    details += `   - Max Speed: ${maxSpeed}\n`;

  // Show corrected cadence (spm for running, rpm for cycling)
  if (cadence) {
    details += `   - Avg Cadence: ${cadence.display}\n`;
  }

  if (activity.average_watts !== undefined && activity.average_watts !== null)
    details += `   - Avg Watts: ${activity.average_watts.toFixed(1)}\n`;
  if (
    activity.average_heartrate !== undefined &&
    activity.average_heartrate !== null
  )
    details += `   - Avg Heart Rate: ${activity.average_heartrate.toFixed(1)} bpm\n`;
  if (activity.max_heartrate !== undefined && activity.max_heartrate !== null)
    details += `   - Max Heart Rate: ${activity.max_heartrate.toFixed(0)} bpm\n`;
  if (activity.calories !== undefined)
    details += `   - Calories: ${activity.calories.toFixed(0)}\n`;
  if (activity.description)
    details += `   - Description: ${activity.description}\n`;
  if (activity.gear) details += `   - Gear: ${activity.gear.name}\n`;

  return details;
}

// Tool definition
export const getActivityDetailsTool = {
  name: "get-activity-details",
  description:
    "Fetches detailed information about a specific activity using its ID.",
  inputSchema: GetActivityDetailsInputSchema,
  execute: async ({ activityId }: GetActivityDetailsInput) => {
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
      console.error(`Fetching details for activity ID: ${activityId}...`);
      // Removed getAuthenticatedAthlete call
      const activity = await fetchActivityById(token, activityId);
      const activityDetailsText = formatActivityDetails(activity); // Use metric formatter

      console.error(
        `Successfully fetched details for activity: ${activity.name}`,
      );
      return {
        content: [{ type: "text" as const, text: activityDetailsText }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching activity ${activityId}: ${errorMessage}`);
      // Removed call to handleApiError
      const userFriendlyMessage =
        errorMessage.includes("Record Not Found") ||
        errorMessage.includes("404")
          ? `Activity with ID ${activityId} not found.`
          : `An unexpected error occurred while fetching activity details for ID ${activityId}. Details: ${errorMessage}`;
      return {
        content: [{ type: "text" as const, text: `❌ ${userFriendlyMessage}` }],
        isError: true,
      };
    }
  },
};

// Removed old registration function
/*
export function registerGetActivityDetailsTool(server: McpServer) {
  server.tool(
    getActivityDetails.name,
    getActivityDetails.description,
    getActivityDetails.inputSchema.shape,
    getActivityDetails.execute
  );
}
*/
