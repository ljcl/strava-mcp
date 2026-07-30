import { z } from "zod";
import { formatDistance } from "../formatters";
import {
  boundsString,
  buildTiles,
  type CourseTile,
  dedupeInCourseOrder,
  MAX_TILES,
  ON_COURSE_TOLERANCE_M,
  placeOnTrack,
  type TrackPlacement,
} from "../routeSegments";
import {
  exploreSegments,
  listAllStarredSegments,
  type StravaExplorerResponse,
} from "../stravaClient";
import { loadTrackGeometry, type TrackEffort } from "../trackGeometry";
import { mapWithConcurrency } from "../utils/concurrency";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { FindSegmentsOnRouteOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "find-segments-on-route";

const description = `
Lists the named segments a saved route or a past activity actually passes through, in course order.

explore-segments only answers "what is inside this rectangle", which for a 20 km
route is a box full of segments nowhere near the course. This tool walks the
course itself in overlapping tiles and keeps only the segments whose start and
end both land on the track in forward order, so the answer is what you will
really hit. Each segment reports:
- How far into the course it starts, and its length and average grade
- Its climb category, when it is a categorised climb
- Whether you have starred it
- When an activity id is given: your own time on it, and any PR or top-10 result

Use Cases:
- "Before I race this route, what segments and climbs will I hit?"
- "Which of the segments on Sunday's run have I done before?"
- Build a segment hit list for a route you have saved but never ridden

Parameters:
- routeId or activityId (exactly one required): the course to scan
- activityType (optional): restrict to "running" or "riding" segments
- toleranceMeters (optional, default ${ON_COURSE_TOLERANCE_M}): how far a segment endpoint may sit from the course and still count as on it. Raise it if a route returns fewer segments than expected — a saved route reaches Strava as a downsampled line

Notes:
- Costs up to ${MAX_TILES} explore calls plus one course fetch; long courses are tiled more coarsely rather than partially
- Strava's explore endpoint returns only popular segments, so quiet ones may be missing
`;

const inputSchema = z.object({
  routeId: stravaIdInput("The Strava route to scan.").optional(),
  activityId: stravaIdInput(
    "A past Strava activity to scan instead of a route.",
  ).optional(),
  activityType: z
    .enum(["running", "riding"])
    .optional()
    .describe(
      "Restrict results to running or riding segments. Defaults to matching the course's own discipline.",
    ),
  toleranceMeters: z
    .number()
    .int()
    .min(10)
    .max(500)
    .optional()
    .describe(
      `How far a segment endpoint may sit from the course and still count as on it (default ${ON_COURSE_TOLERANCE_M} m).`,
    ),
});

type FindSegmentsOnRouteInput = z.infer<typeof inputSchema>;

interface FoundSegment {
  id: string;
  placement: TrackPlacement;
  name: string;
  distanceMeters: number;
  avgGradePct: number;
  climbCategory: number;
  climbCategoryDesc: string;
  elevDifferenceM: number;
  starred: boolean;
  effort: TrackEffort | null;
}

/**
 * Explore each tile. Concurrency-bounded and rate-limit-aware for the same
 * reason `get-best-efforts` is (#239): a serial loop spends one round-trip per
 * tile, and a 429 mid-scan means the remaining calls cannot succeed.
 */
const TILE_CONCURRENCY = 3;

/** Map a course's discipline onto explore's two-valued filter. */
function defaultActivityType(
  activityType: string | null,
): "running" | "riding" | undefined {
  if (!activityType) return undefined;
  if (/run|walk|hike/i.test(activityType)) return "running";
  if (/ride|bike|cycl/i.test(activityType)) return "riding";
  return undefined;
}

export const findSegmentsOnRouteTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: FindSegmentsOnRouteOutputSchema,
  execute: async (
    {
      routeId,
      activityId,
      activityType,
      toleranceMeters,
    }: FindSegmentsOnRouteInput,
    token: string,
  ) => {
    if ((routeId && activityId) || (!routeId && !activityId)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Input Error: provide exactly one of routeId or activityId.",
          },
        ],
        isError: true,
      };
    }

    try {
      const course = await loadTrackGeometry(token, {
        ...(activityId ? { activityId } : {}),
        ...(routeId ? { routeId } : {}),
      });

      if (course.coordinates.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: `"${course.name}" has no GPS track, so there is no course to scan for segments.`,
            },
          ],
          isError: true,
        };
      }

      const tiles = buildTiles(course.coordinates, course.distances);
      const filter = activityType ?? defaultActivityType(course.activityType);
      const tolerance = toleranceMeters ?? ON_COURSE_TOLERANCE_M;

      // A 429 means the quota is exhausted; the remaining tiles cannot succeed,
      // so stop and report the partial coverage rather than hiding it.
      const failed: number[] = [];
      let stopped = false;
      const responses = await mapWithConcurrency(
        tiles,
        TILE_CONCURRENCY,
        async (tile: CourseTile) => {
          try {
            return await exploreSegments(
              token,
              boundsString(tile.bounds),
              filter,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (/rate limit/i.test(message)) stopped = true;
            failed.push(tile.startM);
            return null;
          }
        },
        () => stopped,
      );

      const starred = await starredIds(token);
      const effortsBySegment = new Map(
        course.efforts.map((effort) => [effort.segmentId, effort]),
      );

      const candidates: FoundSegment[] = [];
      for (const response of responses) {
        for (const segment of (response as StravaExplorerResponse | null)
          ?.segments ?? []) {
          const placement = placeOnTrack(
            course.coordinates,
            course.distances,
            segment.start_latlng,
            segment.end_latlng,
            tolerance,
          );
          if (!placement) continue;
          const id = String(segment.id);
          candidates.push({
            id,
            placement,
            name: segment.name,
            distanceMeters: segment.distance,
            avgGradePct: segment.avg_grade,
            climbCategory: segment.climb_category,
            climbCategoryDesc: segment.climb_category_desc,
            elevDifferenceM: segment.elev_difference,
            starred: segment.starred === true || starred.has(id),
            effort: effortsBySegment.get(id) ?? null,
          });
        }
      }
      const found = dedupeInCourseOrder(candidates);

      const warnings: string[] = [];
      if (stopped) {
        warnings.push(
          `Strava's rate limit stopped the scan after ${responses.filter(Boolean).length} of ${tiles.length} stretches, so segments later in the course may be missing.`,
        );
      } else if (failed.length > 0) {
        warnings.push(
          `${failed.length} of ${tiles.length} stretches could not be searched, so some segments may be missing.`,
        );
      }
      if (course.distanceSource === "haversine") {
        warnings.push(
          "Distances along the course were derived from its geometry, not a recorded distance stream, so the marks are approximate.",
        );
      }

      const structured = {
        source: course.source,
        id: course.id,
        name: course.name,
        activity_type: course.activityType,
        distance_m: course.declaredDistanceM,
        tiles_searched: tiles.length,
        tile_length_m: tiles[0] ? tiles[0].endM - tiles[0].startM : 0,
        tolerance_m: tolerance,
        segment_count: found.length,
        segments: found.map((segment) => ({
          segment_id: segment.id,
          name: segment.name,
          at_m: segment.placement.startM,
          distance_m: segment.distanceMeters,
          avg_grade_pct: segment.avgGradePct,
          elev_difference_m: segment.elevDifferenceM,
          climb_category: segment.climbCategory,
          climb_category_desc: segment.climbCategoryDesc,
          starred: segment.starred,
          off_course_m: segment.placement.offCourseM,
          your_effort: segment.effort
            ? {
                elapsed_time_s: segment.effort.elapsedTime,
                pr_rank: segment.effort.prRank,
                kom_rank: segment.effort.komRank,
              }
            : null,
        })),
        warnings,
      };
      warnOnSchemaDrift(name, FindSegmentsOnRouteOutputSchema, structured);

      const label = course.source === "route" ? "Route" : "Activity";
      const lines = [
        `Segments on ${label}: ${course.name} (ID: ${course.id})`,
        `${formatDistance(course.declaredDistanceM)} course, searched in ${tiles.length} stretch${tiles.length === 1 ? "" : "es"}; ${found.length} segment${found.length === 1 ? "" : "s"} on course`,
        "",
      ];

      if (found.length === 0) {
        lines.push(
          "No segments matched the course. Strava's explore endpoint only returns popular segments, and a downsampled route line can push endpoints off the track — try a larger toleranceMeters.",
        );
      }

      for (const segment of found) {
        const at = formatDistance(segment.placement.startM);
        const badges = [
          segment.starred ? "⭐" : null,
          segment.effort?.prRank != null ? "PR" : null,
          segment.effort?.komRank != null ? "top-10" : null,
        ].filter(Boolean);
        lines.push(
          `${at.padStart(8)}  ${segment.name}${badges.length > 0 ? ` (${badges.join(", ")})` : ""}`,
        );
        const detail = [
          formatDistance(segment.distanceMeters),
          `${segment.avgGradePct.toFixed(1)}%`,
          `${segment.elevDifferenceM >= 0 ? "+" : ""}${Math.round(segment.elevDifferenceM)} m`,
          segment.climbCategory > 0 ? `cat ${segment.climbCategoryDesc}` : null,
          segment.effort
            ? `your time ${formatElapsed(segment.effort.elapsedTime)}`
            : null,
          `ID: ${segment.id}`,
        ].filter(Boolean);
        lines.push(`          ${detail.join(", ")}`);
      }

      if (warnings.length > 0) {
        lines.push("");
        for (const warning of warnings) lines.push(`Warning: ${warning}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error in ${name}:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to find segments on this course: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * The athlete's whole starred set. Explore already flags `starred` on each
 * result, but only for segments it knows the athlete has starred in that
 * response — the complete list is what makes the flag trustworthy (#246), and a
 * failure here costs a flag rather than the answer.
 */
async function starredIds(token: string): Promise<Set<string>> {
  try {
    const segments = await listAllStarredSegments(token);
    return new Set(segments.map((segment) => String(segment.id)));
  } catch (error) {
    console.error(
      `${name}: starred segments unavailable (${error instanceof Error ? error.message : String(error)}); star flags may be incomplete.`,
    );
    return new Set();
  }
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
