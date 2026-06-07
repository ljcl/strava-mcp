import { z } from "zod";
import {
  getActivityZones as getActivityZonesClient,
  type StravaActivityZone,
} from "../stravaClient";
import { formatDuration } from "../utils";
import { READ_ONLY } from "./_annotations";

const name = "get-activity-zones";

const description = `
Retrieves the time-in-zone distribution for a specific Strava activity.

Unlike get-athlete-zones (which returns zone *definitions*), this returns how
long the given activity spent in each heart rate and/or power zone.

Use Cases:
- See how a workout was distributed across HR or power zones
- Quantify time spent in each training zone for a single activity
- Compare effort distribution between activities

Parameters:
- id (required): The unique identifier of the Strava activity.

Output Format:
A human-readable summary listing each zone band with the time spent and its
percentage of the total, for heart rate and power when present, plus the
complete raw JSON from the Strava API.

Notes:
- Requires activity:read scope for public/followers activities, activity:read_all for private activities
- Not all activities have zone data (e.g. no HR/power sensor); a graceful message is returned in that case
`;

const inputSchema = z.object({
  id: z
    .union([z.number(), z.string()])
    .describe("The identifier of the activity to fetch zones for."),
});

type GetActivityZonesInput = z.infer<typeof inputSchema>;

const ZONE_META: Record<
  string,
  { emoji: string; label: string; unit: string }
> = {
  heartrate: { emoji: "❤️", label: "Heart Rate Zones", unit: "bpm" },
  power: { emoji: "⚡", label: "Power Zones", unit: "W" },
};

function formatBuckets(
  buckets: { min: number; max: number; time: number }[],
  unit: string,
): string {
  const total = buckets.reduce((sum, bucket) => sum + bucket.time, 0);

  return buckets
    .map((bucket, index) => {
      // The final bucket uses max: -1 to mean "and above".
      const range =
        bucket.max === -1
          ? `${bucket.min}+ ${unit}`
          : `${bucket.min}–${bucket.max} ${unit}`;
      const percentage =
        total > 0 ? ((bucket.time / total) * 100).toFixed(1) : "0.0";
      return `   Z${index + 1} (${range}): ${formatDuration(bucket.time)} (${percentage}%)`;
    })
    .join("\n");
}

/**
 * Builds the human-readable per-zone summary for an activity's zone data.
 * Exported for direct testing.
 */
export function formatActivityZones(zones: StravaActivityZone[]): string {
  return zones
    .map((zone) => {
      const meta = zone.type ? ZONE_META[zone.type] : undefined;
      const heading = meta ? `${meta.emoji} **${meta.label}**` : "**Zones**";
      const unit = meta?.unit ?? "";

      if (
        !zone.distribution_buckets ||
        zone.distribution_buckets.length === 0
      ) {
        return `${heading}\n   Distribution data not available.`;
      }

      return `${heading}\n${formatBuckets(zone.distribution_buckets, unit)}`;
    })
    .join("\n\n");
}

export const getActivityZonesTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  execute: async ({ id }: GetActivityZonesInput) => {
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
      console.error(`Fetching zones for activity ID: ${id}...`);

      const zones = await getActivityZonesClient(token, id);

      // No usable data when no zone set has any distribution buckets (e.g. the
      // activity had neither an HR nor a power sensor). Covers the empty-array case.
      const hasData = zones.some(
        (zone) =>
          zone.distribution_buckets && zone.distribution_buckets.length > 0,
      );

      if (!hasData) {
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ No zone data found for activity ID: ${id}`,
            },
          ],
        };
      }

      const summaryText = `**Activity Zones (ID: ${id}):**\n\n${formatActivityZones(zones)}`;
      const rawDataText = `\n\nComplete Zone Data:\n${JSON.stringify(zones, null, 2)}`;

      console.error(
        `Successfully fetched ${zones.length} zone set(s) for activity ${id}`,
      );

      return {
        content: [
          { type: "text" as const, text: summaryText },
          { type: "text" as const, text: rawDataText },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching zones for activity ${id}: ${errorMessage}`);
      const userFriendlyMessage =
        errorMessage.includes("Record Not Found") ||
        errorMessage.includes("404")
          ? `Activity with ID ${id} not found.`
          : `An unexpected error occurred while fetching zones for activity ${id}. Details: ${errorMessage}`;
      return {
        content: [{ type: "text" as const, text: `❌ ${userFriendlyMessage}` }],
        isError: true,
      };
    }
  },
};
