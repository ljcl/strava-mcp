import { z } from "zod";
import { RateLimitError } from "../fetchClient";
import { formatDuration } from "../formatters";
import {
  getActivityById,
  getAllActivities,
  type StravaSummaryActivity,
} from "../stravaClient";
import { metersPerSecToPace } from "../utils/running";
import { READ_ONLY } from "./_annotations";
import { BestEffortsOutputSchema, warnOnSchemaDrift } from "./outputs";

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
- limit (optional): Maximum number of efforts to return per distance (default: 3, max: 50)
- maxActivities (optional): Maximum number of activities to scan (default: 100, max: 200)
- after / before (optional): Scope the scan to a date window (ISO date or date-time)

Notes:
- This tool fetches details for each activity, which can be slow for large histories
- Prefer after/before to scope a season; it is cheaper and more precise than raising maxActivities
- Times use elapsed time (includes stops), matching Strava's Best Efforts behavior
- Only activities with best_efforts data from Strava are included
- If the Strava rate limit is reached part-way, the scan stops and the response says how many activities were skipped rather than presenting a truncated table as complete

Note: this scans recent running activities and fetches each activity's detail to read its best efforts, so it makes one API call per activity and can be slow over long histories; the maxActivities parameter (default 100) bounds the work.
`;

/** ISO date (`2026-01-31`) or full date-time, converted to an epoch second. */
const isoDateInput = (what: string) =>
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Must be an ISO date (2026-01-31) or date-time",
    })
    .optional()
    .describe(what);

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
    .max(50)
    .default(3)
    .describe(
      "Maximum number of efforts to return per distance (default: 3, max: 50)",
    ),
  maxActivities: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of activities to scan (default: 100, max: 200)"),
  after: isoDateInput(
    "Only scan activities on or after this date — scope a season instead of scanning by count.",
  ),
  before: isoDateInput("Only scan activities on or before this date."),
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

const RUNNING_TYPES = ["Run", "TrailRun", "VirtualRun"];

const isRunningActivity = (a: StravaSummaryActivity) =>
  RUNNING_TYPES.includes(a.type ?? a.sport_type ?? "");

/**
 * Activity detail fetches in flight at once. The scan is one request per
 * activity, so a serial loop of the default 100 spent 100 sequential
 * round-trips; a small pool cuts the wall clock without spiking Strava's
 * 15-minute quota faster than the rate-limit backoff can react.
 */
const FETCH_CONCURRENCY = 5;

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, stopping
 * early once `shouldStop` reports true. Returns what completed; the caller
 * reports the remainder as skipped rather than presenting a partial scan as a
 * complete one.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  shouldStop: () => boolean,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        if (shouldStop()) return;
        const index = next++;
        const item = items[index];
        if (item === undefined) return;
        results.push(await worker(item));
      }
    },
  );

  await Promise.all(runners);
  return results;
}

interface BestEffort {
  activity_id: string;
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
  annotations: READ_ONLY,
  outputSchema: BestEffortsOutputSchema,
  execute: async (
    { distance, limit, maxActivities, after, before }: GetBestEffortsInput,
    token: string,
  ) => {
    try {
      console.error(
        `Fetching best efforts (scanning up to ${maxActivities} activities)...`,
      );

      // Fetch running activities. maxItems/countActivity stop the pagination
      // once enough runs have arrived instead of walking the whole history.
      const allActivities = await getAllActivities(token, {
        perPage: Math.min(maxActivities, 200),
        maxItems: maxActivities,
        countActivity: isRunningActivity,
        ...(after ? { after: Math.floor(Date.parse(after) / 1000) } : {}),
        ...(before ? { before: Math.floor(Date.parse(before) / 1000) } : {}),
      });

      // Filter to running activities
      const runningActivities = allActivities
        .filter(isRunningActivity)
        .slice(0, maxActivities);

      console.error(
        `Found ${runningActivities.length} running activities to analyze`,
      );

      // Collect best efforts from each activity
      const allEfforts = new Map<string, BestEffort[]>();
      let activitiesWithEfforts = 0;
      let activitiesRead = 0;
      let failedFetches = 0;
      // A 429 means the quota is genuinely exhausted (the fetch layer has
      // already honoured Retry-After where it could). Continuing would spend
      // the rest of the scan on requests that cannot succeed and would starve
      // every other tool, so the scan stops and reports what it missed.
      // Held in an object so TypeScript does not narrow it to `null` for the
      // reporting below — it is only ever assigned inside the worker closure.
      const abort: { rateLimit: RateLimitError | null } = { rateLimit: null };

      await mapWithConcurrency(
        runningActivities,
        FETCH_CONCURRENCY,
        async (activitySummary) => {
          let activity: Awaited<ReturnType<typeof getActivityById>>;
          try {
            activity = await getActivityById(token, activitySummary.id);
          } catch (err) {
            if (err instanceof RateLimitError) {
              abort.rateLimit ??= err;
            } else {
              failedFetches += 1;
              console.error(
                `Failed to fetch activity ${activitySummary.id}: ${err}`,
              );
            }
            return;
          }

          activitiesRead += 1;

          if (!activity.best_efforts || activity.best_efforts.length === 0) {
            return;
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
        },
        () => abort.rateLimit !== null,
      );

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

      // Activities whose efforts are missing from the table: those the scan
      // never reached because it aborted, plus individual failed fetches.
      const analyzed = activitiesRead;
      const skipped = runningActivities.length - analyzed;

      const warnings: string[] = [];
      if (abort.rateLimit) {
        warnings.push(
          `Strava's rate limit was reached part-way through the scan, so ${skipped} of ${runningActivities.length} activities were not read and their efforts are missing below. ${abort.rateLimit.message} Retry after the window resets, or narrow the scan with after/before.`,
        );
      } else if (failedFetches > 0) {
        warnings.push(
          `${failedFetches} activit${failedFetches === 1 ? "y" : "ies"} could not be fetched, so their efforts are missing below.`,
        );
      }

      const response = {
        best_efforts: orderedResults,
        activities_analyzed: analyzed,
        activities_with_efforts: activitiesWithEfforts,
        activities_skipped: skipped,
        warnings,
        note: "Times use elapsed time (includes stops), matching Strava's Best Efforts behavior",
      };

      // Format as readable text
      let output = `🏆 **Best Efforts Summary**\n`;
      output += `📊 Analyzed ${analyzed} activities (${activitiesWithEfforts} with best efforts)\n`;
      if (skipped > 0) {
        output += `⚠️ ${skipped} activit${skipped === 1 ? "y" : "ies"} skipped — the results below are incomplete\n`;
      }
      output += `\n`;

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

      warnOnSchemaDrift("get-best-efforts", BestEffortsOutputSchema, response);

      return {
        content: [{ type: "text" as const, text: output }],
        structuredContent: response,
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
