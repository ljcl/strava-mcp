import { z } from "zod";
import { getActivityById, getAllActivities } from "../stravaClient";
import { formatDuration, metersPerSecToPace } from "../utils/running";

const name = "get-best-efforts";

const description = `
Aggregates personal best efforts across all running activities.

This tool retrieves and ranks your best times at standard distances:
- 400m, 1/2 mile, 1K, 1 mile, 2 mile
- 5K, 10K, 15K, 10 mile
- Half Marathon, Marathon, 50K

Use Cases:
- Track PRs across all distances
- Find your best performances at specific distances
- Analyze progress over time at key distances

Parameters:
- distance (optional): Filter to a specific distance (e.g., "5K", "1 mile")
- limit (optional): Maximum number of efforts to return per distance (default: 3)
- maxActivities (optional): Maximum number of activities to scan (default: 100)

Notes:
- This tool fetches details for each activity, which can be slow for large histories
- Use maxActivities to limit API calls for faster results
- Times use elapsed time (includes stops), matching Strava's Best Efforts behavior
- Only activities with best_efforts data from Strava are included
`;

const inputSchema = z.object({
  distance: z
    .string()
    .optional()
    .describe(
      "Filter to a specific distance (e.g., '5K', '1 mile', 'Half Marathon')",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe("Maximum number of efforts to return per distance (default: 3)"),
  maxActivities: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe("Maximum number of activities to scan (default: 100)"),
});

type GetBestEffortsInput = z.infer<typeof inputSchema>;

// Standard distances in order
const STANDARD_DISTANCES = [
  "400m",
  "1/2 mile",
  "1K",
  "1 mile",
  "2 mile",
  "5K",
  "10K",
  "15K",
  "10 mile",
  "Half Marathon",
  "20K",
  "Marathon",
  "50K",
];

interface BestEffort {
  activity_id: number;
  activity_name: string;
  date: string;
  elapsed_time_seconds: number;
  elapsed_time_formatted: string;
  moving_time_seconds: number;
  moving_time_formatted: string;
  pace: { min_per_km: string; min_per_mile: string } | null;
  pr_rank: number | null;
}

export const getBestEffortsTool = {
  name,
  description,
  inputSchema,
  execute: async ({ distance, limit, maxActivities }: GetBestEffortsInput) => {
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
        `Fetching best efforts (scanning up to ${maxActivities} activities)...`,
      );

      // Fetch running activities
      const allActivities = await getAllActivities(token, {
        perPage: Math.min(maxActivities, 200),
      });

      // Filter to running activities
      const runningActivities = allActivities
        .filter((a) =>
          ["Run", "TrailRun", "VirtualRun"].includes(
            a.type ?? a.sport_type ?? "",
          ),
        )
        .slice(0, maxActivities);

      console.error(
        `Found ${runningActivities.length} running activities to analyze`,
      );

      // Collect best efforts from each activity
      const allEfforts = new Map<string, BestEffort[]>();
      let activitiesWithEfforts = 0;

      for (const activitySummary of runningActivities) {
        try {
          const activity = await getActivityById(token, activitySummary.id);

          if (!activity.best_efforts || activity.best_efforts.length === 0) {
            continue;
          }

          activitiesWithEfforts += 1;

          for (const effort of activity.best_efforts) {
            const distanceName = effort.name;

            // Filter if distance specified
            if (distance && distanceName !== distance) {
              continue;
            }

            // Calculate pace from distance and time
            const distanceMeters = effort.distance || 0;
            const elapsedSeconds = effort.elapsed_time || 0;
            const mps =
              elapsedSeconds > 0 ? distanceMeters / elapsedSeconds : 0;
            const pace = metersPerSecToPace(mps);

            const bestEffort: BestEffort = {
              activity_id: activity.id,
              activity_name: activity.name,
              date: (effort.start_date_local || effort.start_date || "").split(
                "T",
              )[0]!,
              elapsed_time_seconds: effort.elapsed_time || 0,
              elapsed_time_formatted: formatDuration(effort.elapsed_time),
              moving_time_seconds: effort.moving_time || 0,
              moving_time_formatted: formatDuration(effort.moving_time),
              pace: pace
                ? { min_per_km: pace.minPerKm, min_per_mile: pace.minPerMile }
                : null,
              pr_rank: effort.pr_rank ?? null,
            };

            if (!allEfforts.has(distanceName)) {
              allEfforts.set(distanceName, []);
            }
            allEfforts.get(distanceName)!.push(bestEffort);
          }
        } catch (err) {
          // Skip activities that fail to fetch
          console.error(
            `Failed to fetch activity ${activitySummary.id}: ${err}`,
          );
        }
      }

      // Sort and limit each distance
      const results: Record<string, BestEffort[]> = {};

      for (const [distanceName, efforts] of allEfforts) {
        const sorted = efforts.sort(
          (a, b) => a.elapsed_time_seconds - b.elapsed_time_seconds,
        );
        results[distanceName] = sorted.slice(0, limit);
      }

      // Order by standard distance order
      const orderedResults: Record<string, BestEffort[]> = {};
      for (const stdDistance of STANDARD_DISTANCES) {
        if (results[stdDistance]) {
          orderedResults[stdDistance] = results[stdDistance];
        }
      }
      // Add any non-standard distances at the end
      for (const distanceName of Object.keys(results)) {
        if (!orderedResults[distanceName] && results[distanceName]) {
          orderedResults[distanceName] = results[distanceName];
        }
      }

      const response = {
        best_efforts: orderedResults,
        activities_analyzed: runningActivities.length,
        activities_with_efforts: activitiesWithEfforts,
        note: "Times use elapsed time (includes stops), matching Strava's Best Efforts behavior",
      };

      // Format as readable text
      let output = `🏆 **Best Efforts Summary**\n`;
      output += `📊 Analyzed ${runningActivities.length} activities (${activitiesWithEfforts} with best efforts)\n\n`;

      if (Object.keys(orderedResults).length === 0) {
        output += `No best efforts found.`;
        if (distance) {
          output += ` Try removing the distance filter or scanning more activities.`;
        }
        output += `\n`;
      } else {
        for (const [distanceName, efforts] of Object.entries(orderedResults)) {
          output += `**${distanceName}**\n`;
          for (let i = 0; i < efforts.length; i += 1) {
            const effort = efforts[i];
            if (!effort) continue;
            const rank = i + 1;
            const prLabel =
              effort.pr_rank === 1
                ? " 🥇 PR"
                : effort.pr_rank === 2
                  ? " 🥈"
                  : effort.pr_rank === 3
                    ? " 🥉"
                    : "";
            output += `  ${rank}. ${effort.elapsed_time_formatted}`;
            if (effort.pace) output += ` (${effort.pace.min_per_km} /km)`;
            output += ` - ${effort.date}${prLabel}\n`;
            output += `     ${effort.activity_name}\n`;
          }
          output += `\n`;
        }
      }

      output += `ℹ️ ${response.note}\n`;

      console.error(
        `Successfully retrieved best efforts from ${activitiesWithEfforts} activities`,
      );

      return {
        content: [
          { type: "text" as const, text: output },
          {
            type: "text" as const,
            text: `\n**Raw Data:**\n${JSON.stringify(response, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching best efforts: ${errorMessage}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `❌ An unexpected error occurred while fetching best efforts. Details: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
