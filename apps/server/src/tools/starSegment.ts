import { z } from "zod";
import { starSegment as updateStarStatus } from "../stravaClient"; // Renamed import
import { WRITE_IDEMPOTENT } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { StarSegmentOutputSchema, warnOnSchemaDrift } from "./outputs";

const StarSegmentInputSchema = z.object({
  segmentId: stravaIdInput(
    "The unique identifier of the segment to star or unstar.",
  ),
  starred: z
    .boolean()
    .describe("Set to true to star the segment, false to unstar it."),
});

type StarSegmentInput = z.infer<typeof StarSegmentInputSchema>;

// Export the tool definition directly
export const starSegment = {
  name: "star-segment",
  description:
    "Stars or unstars a specific segment for the authenticated athlete.",
  inputSchema: StarSegmentInputSchema,
  annotations: WRITE_IDEMPOTENT,
  outputSchema: StarSegmentOutputSchema,
  execute: async ({ segmentId, starred }: StarSegmentInput, token: string) => {
    try {
      const action = starred ? "starring" : "unstarring";
      console.error(`Attempting to ${action} segment ID: ${segmentId}...`);

      const updatedSegment = await updateStarStatus(token, segmentId, starred);

      const successMessage = `Successfully ${action} segment: "${updatedSegment.name}" (ID: ${updatedSegment.id}). Its starred status is now: ${updatedSegment.starred}.`;
      console.error(successMessage);

      const structured = {
        segment_id: updatedSegment.id,
        name: updatedSegment.name,
        starred: Boolean(updatedSegment.starred),
      };
      warnOnSchemaDrift("star-segment", StarSegmentOutputSchema, structured);

      return {
        content: [{ type: "text" as const, text: successMessage }],
        structuredContent: structured,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      const action = starred ? "star" : "unstar";
      console.error(
        `Error attempting to ${action} segment ID ${segmentId}:`,
        errorMessage,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ API Error: Failed to ${action} segment ${segmentId}. ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
