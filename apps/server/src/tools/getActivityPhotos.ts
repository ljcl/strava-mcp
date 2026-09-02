import { z } from "zod";
import { getActivityPhotos as getActivityPhotosClient } from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import { stravaIdInput } from "./_ids";
import { ActivityPhotosOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-activity-photos";

const description = `
Retrieves the photos attached to a specific Strava activity.

Use Cases:
- Fetch the photos uploaded to an activity
- Get photo URLs for display or download
- Access photo captions, locations, and timestamps

Parameters:
- id (required): The unique identifier of the Strava activity.
- size (optional): Photo size in pixels (e.g., 100, 600, 2048). Strava keys each photo's URLs by size; when omitted it returns every available size. The structured payload carries the largest URL returned.

Notes:
- Requires activity:read scope for public/followers activities, activity:read_all for private activities
- Photos may come from Strava uploads or linked Instagram posts
- An activity with no photos returns a message and an empty photos list (count: 0), not an error
`;

const inputSchema = z.object({
  id: stravaIdInput("The identifier of the activity to fetch photos for."),
  size: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional photo size in pixels (e.g., 100, 600, 2048)."),
});

type GetActivityPhotosInput = z.infer<typeof inputSchema>;

export const getActivityPhotosTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: ActivityPhotosOutputSchema,
  execute: async ({ id, size }: GetActivityPhotosInput, token: string) => {
    try {
      // `id` arrives already validated and normalised to a digit string by
      // `stravaIdInput`; parsing it back to a number here (as this handler
      // used to) would re-introduce the precision loss the string form exists
      // to avoid, for any id above 2^53.
      console.error(`Fetching photos for activity ID: ${id}...`);
      const photos = await getActivityPhotosClient(token, id, size);

      if (!photos || photos.length === 0) {
        const empty = { activity_id: id, photos: [], count: 0 };
        warnOnSchemaDrift(
          "get-activity-photos",
          ActivityPhotosOutputSchema,
          empty,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `No photos found for activity ID: ${id}`,
            },
          ],
          structuredContent: empty,
        };
      }

      // Generate human-readable summary
      const photoSummaries = photos.map((photo, index) => {
        const details = [
          `Photo ${index + 1}${photo.id ? ` (ID: ${photo.id})` : ""}${photo.unique_id ? ` [${photo.unique_id}]` : ""}`,
        ];

        // Add source info
        if (photo.source !== undefined) {
          const sourceText =
            photo.source === 1
              ? "Strava"
              : photo.source === 2
                ? "Instagram"
                : `Unknown (${photo.source})`;
          details.push(`  Source: ${sourceText}`);
        }

        // Add caption if available
        if (photo.caption) {
          details.push(`  Caption: ${photo.caption}`);
        }

        // Add location if available
        if (photo.location && photo.location.length === 2) {
          const lat = photo.location[0];
          const lng = photo.location[1];
          if (lat !== undefined && lng !== undefined) {
            details.push(`  Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        }

        // Add timestamps
        if (photo.created_at) {
          details.push(`  Created: ${photo.created_at}`);
        }

        // Add URLs
        if (photo.urls && Object.keys(photo.urls).length > 0) {
          details.push("  URLs:");
          for (const [sizeKey, url] of Object.entries(photo.urls)) {
            details.push(`    ${sizeKey}: ${url}`);
          }
        }

        return details.join("\n");
      });

      const summaryText = `Activity Photos (ID: ${id})\nTotal Photos: ${photos.length}\n\n${photoSummaries.join("\n\n")}`;

      console.error(
        `Successfully fetched ${photos.length} photos for activity ${id}`,
      );

      // Largest URL wins: Strava keys `urls` by requested pixel size, and a
      // caller chaining on this wants the best available, not an arbitrary one.
      const structured = {
        activity_id: id,
        photos: photos.map((photo) => {
          const sizes = Object.entries(photo.urls ?? {});
          const largest = sizes.sort(
            (a, b) => Number(b[0]) - Number(a[0]),
          )[0]?.[1];
          return {
            id: photo.id ?? null,
            unique_id: photo.unique_id ?? null,
            caption: photo.caption ?? null,
            url: largest ?? null,
            created_at: photo.created_at ?? null,
            location:
              photo.location && photo.location.length === 2
                ? photo.location
                : null,
          };
        }),
        count: photos.length,
      };
      warnOnSchemaDrift(
        "get-activity-photos",
        ActivityPhotosOutputSchema,
        structured,
      );

      // The summary is the only text block: the structured payload is the
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
              context: `fetch photos for activity ${id}`,
              notFound: `Activity with ID ${id} not found.`,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
