import { z } from "zod";
import { mapActivityZones } from "../activityZones";
import { formatDuration } from "../formatters";
import {
  getActivityZones as getActivityZonesClient,
  type StravaActivityZone,
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import { stravaIdInput } from "./_ids";
import { ActivityZonesOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-activity-zones";

const description = `
Retrieves the time-in-zone distribution for a specific Strava activity: how
long it spent in each heart rate and/or power zone, as opposed to the
athlete's zone definitions.

Use Cases:
- See how a workout was distributed across HR or power zones
- Quantify time spent in each training zone for a single activity
- Compare effort distribution between activities

Parameters:
- id (required): The unique identifier of the Strava activity.

Notes:
- Requires activity:read scope for public/followers activities, activity:read_all for private activities
- Not all activities have zone data (e.g. no HR or power sensor); those return a message and an empty zone_sets list, not an error
`;

const inputSchema = z.object({
  id: stravaIdInput("The identifier of the activity to fetch zones for."),
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
  outputSchema: ActivityZonesOutputSchema,
  execute: async ({ id }: GetActivityZonesInput, token: string) => {
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
        const empty = { activity_id: id, zone_sets: [] };
        warnOnSchemaDrift(
          "get-activity-zones",
          ActivityZonesOutputSchema,
          empty,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ No zone data found for activity ID: ${id}`,
            },
          ],
          structuredContent: empty,
        };
      }

      const summaryText = `**Activity Zones (ID: ${id}):**\n\n${formatActivityZones(zones)}`;

      console.error(
        `Successfully fetched ${zones.length} zone set(s) for activity ${id}`,
      );

      // Same mapper the activity-zones app reads (`mapActivityZones`), so the
      // structured payload and the chart cannot describe different zones.
      const structured = {
        activity_id: id,
        zone_sets: mapActivityZones(zones).map((set) => ({
          type: set.type,
          sensor_based: set.sensorBased,
          total_seconds: set.totalSeconds,
          buckets: set.buckets,
        })),
      };
      warnOnSchemaDrift(
        "get-activity-zones",
        ActivityZonesOutputSchema,
        structured,
      );

      // The summary is the only text block: `structuredContent` is the
      // machine-readable copy, and a pretty-printed dump of the raw response
      // alongside it only cost the model tokens.
      return {
        content: [{ type: "text" as const, text: summaryText }],
        structuredContent: structured,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: toolErrorText(error, {
              context: `fetch zones for activity ${id}`,
              notFound: `Activity with ID ${id} not found.`,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
