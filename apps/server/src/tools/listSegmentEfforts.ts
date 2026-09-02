import { z } from "zod";
import { formatDistance, formatDuration } from "../formatters";
import {
  listSegmentEfforts as fetchSegmentEfforts,
  type StravaDetailedSegmentEffort, // Type needed for formatter
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import { stravaIdInput } from "./_ids";
import {
  SegmentEffortsOutputSchema,
  toSegmentEffortSummary,
  warnOnSchemaDrift,
} from "./outputs";

// Zod schema for input validation
const ListSegmentEffortsInputSchema = z.object({
  segmentId: stravaIdInput("The ID of the segment for which to list efforts."),
  startDateLocal: z
    .string()
    .datetime({ error: "Invalid start date format. Use ISO 8601." })
    .optional()
    .describe(
      "Filter efforts starting after this ISO 8601 date-time (optional).",
    ),
  endDateLocal: z
    .string()
    .datetime({ error: "Invalid end date format. Use ISO 8601." })
    .optional()
    .describe(
      "Filter efforts ending before this ISO 8601 date-time (optional).",
    ),
  perPage: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(30)
    .describe("Number of efforts to return per page (default: 30, max: 200)."),
});

type ListSegmentEffortsInput = z.infer<typeof ListSegmentEffortsInputSchema>;

// Format segment effort summary (Metric Only)
function formatSegmentEffort(effort: StravaDetailedSegmentEffort): string {
  const movingTime = formatDuration(effort.moving_time);
  const elapsedTime = formatDuration(effort.elapsed_time);
  const distance = formatDistance(effort.distance);

  // Basic summary: Effort ID, Date, Moving Time, Distance, PR Rank
  let summary = `⏱️ Effort ID: ${effort.id} (${new Date(effort.start_date_local).toLocaleDateString()})`;
  summary += ` | Time: ${movingTime} (Moving), ${elapsedTime} (Elapsed)`;
  summary += ` | Dist: ${distance}`;
  if (effort.pr_rank !== null) summary += ` | PR Rank: ${effort.pr_rank}`;
  if (effort.kom_rank !== null) summary += ` | KOM Rank: ${effort.kom_rank}`; // Add KOM if available
  return summary;
}

// Tool definition
export const listSegmentEffortsTool = {
  name: "list-segment-efforts",
  description:
    "Lists the authenticated athlete's efforts on a specific segment, optionally filtering by date.",
  inputSchema: ListSegmentEffortsInputSchema,
  annotations: READ_ONLY,
  outputSchema: SegmentEffortsOutputSchema,
  execute: async (
    {
      segmentId,
      startDateLocal,
      endDateLocal,
      perPage,
    }: ListSegmentEffortsInput,
    token: string,
  ) => {
    try {
      console.error(`Fetching segment efforts for segment ID: ${segmentId}...`);

      // Use the new params object structure
      const efforts = await fetchSegmentEfforts(token, segmentId, {
        startDateLocal,
        endDateLocal,
        perPage,
      });

      if (!efforts || efforts.length === 0) {
        console.error(
          `No efforts found for segment ${segmentId} with the given filters.`,
        );
        const empty = { segment_id: segmentId, efforts: [], count: 0 };
        warnOnSchemaDrift(
          "list-segment-efforts",
          SegmentEffortsOutputSchema,
          empty,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `No efforts found for segment ${segmentId} matching the criteria.`,
            },
          ],
          structuredContent: empty,
        };
      }

      console.error(
        `Successfully fetched ${efforts.length} efforts for segment ${segmentId}.`,
      );
      const effortSummaries = efforts.map((effort) =>
        formatSegmentEffort(effort),
      ); // Use metric formatter
      const responseText = `**Segment ${segmentId} Efforts:**\n\n${effortSummaries.join("\n")}`;

      const structured = {
        segment_id: segmentId,
        efforts: efforts.map(toSegmentEffortSummary),
        count: efforts.length,
      };
      warnOnSchemaDrift(
        "list-segment-efforts",
        SegmentEffortsOutputSchema,
        structured,
      );

      return {
        content: [{ type: "text" as const, text: responseText }],
        structuredContent: structured,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: toolErrorText(error, {
              context: `list efforts for segment ${segmentId}`,
              notFound: `Segment with ID ${segmentId} not found (when listing efforts).`,
              subscription:
                "Accessing segment efforts requires a Strava subscription. Please check your subscription status.",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
