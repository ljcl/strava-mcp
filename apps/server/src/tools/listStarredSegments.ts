import {
  listStarredSegments as fetchSegments,
  getAuthenticatedAthlete,
} from "../stravaClient"; // Renamed import
import { READ_ONLY } from "./_annotations";

// Export the tool definition directly
export const listStarredSegments = {
  name: "list-starred-segments",
  description:
    "List the segments the athlete has starred. Returns each segment's id, name, distance, average grade, and climb category so the model can pick one to inspect with get-segment or list efforts with list-segment-efforts. Use when the user refers to their saved or favorite segments.",
  // No input schema needed
  inputSchema: undefined,
  annotations: READ_ONLY,
  execute: async () => {
    const token = process.env.STRAVA_ACCESS_TOKEN;

    if (!token || token === "YOUR_STRAVA_ACCESS_TOKEN_HERE") {
      console.error("Missing or placeholder STRAVA_ACCESS_TOKEN in .env");
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Configuration Error: STRAVA_ACCESS_TOKEN is missing or not set in the .env file.",
          },
        ],
        isError: true,
      };
    }

    try {
      console.error("Fetching starred segments...");
      // Need athlete measurement preference for formatting distance
      const athlete = await getAuthenticatedAthlete(token);
      // Use renamed import
      const segments = await fetchSegments(token);
      console.error(
        `Successfully fetched ${segments?.length ?? 0} starred segments.`,
      );

      if (!segments || segments.length === 0) {
        return {
          content: [
            { type: "text" as const, text: " MNo starred segments found." },
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

      const responseText = `**Your Starred Segments:**\n\n${segmentText}`;

      return { content: [{ type: "text" as const, text: responseText }] };
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
