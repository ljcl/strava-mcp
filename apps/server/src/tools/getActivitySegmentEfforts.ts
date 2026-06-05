import { z } from "zod";
import { formatDistance, formatDuration } from "../formatters";
import { getActivityById as fetchActivityById } from "../stravaClient";
import { processSegmentEfforts } from "../utils/segmentEfforts";

const GetActivitySegmentEffortsInputSchema = z.object({
  activityId: z
    .number()
    .int()
    .positive()
    .describe("The unique identifier of the activity to inspect."),
});

type GetActivitySegmentEffortsInput = z.infer<
  typeof GetActivitySegmentEffortsInputSchema
>;

export const getActivitySegmentEffortsTool = {
  name: "get-activity-segment-efforts",
  description:
    "Lists the segment efforts within an activity, highlighting personal records (PRs) " +
    "and top-10 leaderboard placings. Useful for seeing if you set any PRs during a run or ride.",
  inputSchema: GetActivitySegmentEffortsInputSchema,
  execute: async ({ activityId }: GetActivitySegmentEffortsInput) => {
    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
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
      const activity = await fetchActivityById(token, activityId);
      const efforts = activity.segment_efforts ?? [];

      if (efforts.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No segment efforts recorded for activity ${activityId} ("${activity.name}").`,
            },
          ],
        };
      }

      const {
        total,
        prCount,
        topTenCount,
        efforts: processed,
      } = processSegmentEfforts(efforts);

      const header = `Segment efforts for "${activity.name}" (ID ${activityId}): ${total} efforts, ${prCount} PR${prCount === 1 ? "" : "s"}, ${topTenCount} top-10.`;

      const lines = processed.map((e) => {
        const badge = e.achievement ? ` — ${e.achievement}` : "";
        return `   - ${e.segmentName}: ${formatDuration(e.elapsedTime)} over ${formatDistance(e.distance)}${badge}`;
      });

      return {
        content: [
          { type: "text" as const, text: `${header}\n${lines.join("\n")}` },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const friendly =
        message.includes("Record Not Found") || message.includes("404")
          ? `Activity with ID ${activityId} not found.`
          : `Failed to fetch segment efforts for activity ${activityId}: ${message}`;
      return {
        content: [{ type: "text" as const, text: friendly }],
        isError: true,
      };
    }
  },
};
