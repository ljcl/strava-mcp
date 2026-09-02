import { z } from "zod";
import { HttpError } from "../fetchClient";
import {
  computeGradientProfile,
  GradientProfileError,
  type ProfileStreams,
} from "../gradientProfile";
import {
  getSegmentById,
  getSegmentStreams,
  StreamsUnavailableError,
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { describeProfile, profileTextLines } from "./_profileText";
import {
  SegmentProfileOutputSchema,
  toGradientProfileOutput,
  warnOnSchemaDrift,
} from "./outputs";

const name = "get-segment-profile";

const description = `
Breaks one segment's gradient down along its length, from its stored elevation streams.

get-segment reports a single average grade, which hides the difference between
a steady ramp and a flat kilometre followed by a wall — two segments you would
pace completely differently. This tool reports:
- A gradient band every 100 m (wider on long segments) with each band's own grade
- Every sustained climb inside the segment (grade ≥ 2% for ≥ 200 m, dip-tolerant)
- The crux: the steepest sustained ~200 m stretch and how far into the segment it sits
- A shape verdict — steady, front-loaded, back-loaded, rolling, or flat

Use Cases:
- "Is this climb steady or does it kick at the top?"
- Decide where to spend the effort before a segment attempt
- Explain why an average grade felt wrong for how hard the segment was

Parameters:
- segmentId (required): The Strava segment to profile

Notes:
- Segment streams are subscriber-only; without a subscription this reports that plainly
- Elevation is Strava's stored profile for the segment, not raw barometric samples
`;

const inputSchema = z.object({
  segmentId: stravaIdInput("The Strava segment to profile."),
});

type GetSegmentProfileInput = z.infer<typeof inputSchema>;

export const getSegmentProfileTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: SegmentProfileOutputSchema,
  execute: async ({ segmentId }: GetSegmentProfileInput, token: string) => {
    try {
      const [segment, streams] = await Promise.all([
        getSegmentById(token, segmentId),
        getSegmentStreams(token, segmentId),
      ]);

      const distance = streams.get("distance") as number[] | undefined;
      const altitude = streams.get("altitude") as number[] | undefined;
      if (!distance || !altitude) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ "${segment.name}" has no stored elevation profile, so its gradient cannot be broken down.`,
            },
          ],
          isError: true,
        };
      }

      const profile = computeGradientProfile({
        distance,
        altitude,
      } satisfies ProfileStreams);

      const structured = {
        segment_id: String(segment.id),
        name: segment.name,
        activity_type: segment.activity_type,
        climb_category: segment.climb_category ?? null,
        profile: toGradientProfileOutput(profile),
        warnings: profile.warnings,
      };
      warnOnSchemaDrift(name, SegmentProfileOutputSchema, structured);

      const header = [
        `Segment Profile: ${segment.name} (ID: ${segment.id})`,
        [
          `${(profile.lengthM / 1000).toFixed(2)} km`,
          `avg ${profile.avgGradePct}%`,
          `+${profile.elevationGainM} m / -${profile.elevationLossM} m`,
          segment.climb_category != null && segment.climb_category > 0
            ? `climb category ${segment.climb_category}`
            : null,
        ]
          .filter(Boolean)
          .join(", "),
        "",
        describeProfile(profile, "segment"),
        "",
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: [...header, ...profileTextLines(profile)].join("\n"),
          },
        ],
        structuredContent: structured,
      };
    } catch (error) {
      // A segment that recorded no streams is a real answer, not a failure of
      // the tool — say so rather than dressing it up as an API error.
      if (error instanceof StreamsUnavailableError) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Segment ${segmentId} has no stored elevation streams, so its gradient cannot be broken down. Older or very short segments sometimes have none.`,
            },
          ],
          isError: true,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      // The 402 handleApiError kept on the error, not its message prefix.
      if (error instanceof HttpError && error.response.status === 402) {
        return {
          content: [
            {
              type: "text" as const,
              text: "❌ Strava restricts segment stream data to subscribers, so this segment's gradient breakdown is unavailable on your account. get-segment still reports its average and maximum grade.",
            },
          ],
          isError: true,
        };
      }
      if (error instanceof GradientProfileError) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error.message}` }],
          isError: true,
        };
      }
      console.error(`Error in ${name}:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to profile segment ${segmentId}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
