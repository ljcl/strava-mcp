import { z } from "zod";
import {
  listStarredSegments as fetchSegments,
  getAuthenticatedAthlete,
  STARRED_SEGMENTS_DEFAULT_PER_PAGE,
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";

/**
 * Paging is part of the tool contract (#246). Strava serves `/segments/starred`
 * one page at a time regardless, so without these the caller had no way to
 * reach page two and no way to know page two existed.
 */
const ListStarredSegmentsInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based page of starred segments to fetch (default 1)."),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      `Starred segments per page, 1-200 (default ${STARRED_SEGMENTS_DEFAULT_PER_PAGE}).`,
    ),
});

type ListStarredSegmentsInput = z.infer<typeof ListStarredSegmentsInputSchema>;

// Export the tool definition directly
export const listStarredSegments = {
  name: "list-starred-segments",
  description:
    "List the segments the athlete has starred. Returns each segment's id, name, distance, average grade, and climb category so the model can pick one to inspect with get-segment or list efforts with list-segment-efforts. Results are paged: when the response says more are available, call again with the next page. Use when the user refers to their saved or favorite segments.",
  inputSchema: ListStarredSegmentsInputSchema,
  annotations: READ_ONLY,
  execute: async (
    { page, perPage }: ListStarredSegmentsInput,
    token: string,
  ) => {
    const currentPage = page ?? 1;
    const pageSize = perPage ?? STARRED_SEGMENTS_DEFAULT_PER_PAGE;
    try {
      console.error(
        `Fetching starred segments (page ${currentPage}, ${pageSize} per page)...`,
      );
      // Need athlete measurement preference for formatting distance
      const athlete = await getAuthenticatedAthlete(token);
      // Use renamed import
      const segments = await fetchSegments(token, currentPage, pageSize);
      console.error(
        `Successfully fetched ${segments?.length ?? 0} starred segments.`,
      );

      if (!segments || segments.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                currentPage > 1
                  ? `No starred segments on page ${currentPage}.`
                  : "No starred segments found.",
            },
          ],
        };
      }

      const distanceFactor =
        athlete.measurement_preference === "feet" ? 0.000621371 : 0.001;
      const distanceUnit =
        athlete.measurement_preference === "feet" ? "mi" : "km";

      // Format the segments into a text response
      const segmentText = segments
        .map((segment) => {
          const location =
            [segment.city, segment.state, segment.country]
              .filter(Boolean)
              .join(", ") || "N/A";
          const distance = (segment.distance * distanceFactor).toFixed(2);
          return `
⭐ **${segment.name}** (ID: ${segment.id})
   - Activity Type: ${segment.activity_type}
   - Distance: ${distance} ${distanceUnit}
   - Avg Grade: ${segment.average_grade}%
   - Location: ${location}
   - Private: ${segment.private ? "Yes" : "No"}
          `.trim();
        })
        .join("\n---\n");

      // A full page means Strava had at least this many; there may be more.
      // Saying so is the point of #246 — a truncated list presented as
      // complete is worse than no list.
      const heading =
        currentPage > 1
          ? `**Your Starred Segments (page ${currentPage}):**`
          : "**Your Starred Segments:**";
      const lines = [heading, "", segmentText];
      if (segments.length === pageSize) {
        lines.push(
          "",
          `Showing ${segments.length} starred segments (page ${currentPage}); more may be available — call again with page ${currentPage + 1}.`,
        );
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      console.error("Error in list-starred-segments tool:", errorMessage);
      return {
        content: [
          { type: "text" as const, text: `❌ API Error: ${errorMessage}` },
        ],
        isError: true,
      };
    }
  },
};
