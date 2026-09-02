import { z } from "zod";
import { HttpError } from "../fetchClient";
import {
  compareEffortSlices,
  type EffortSlice,
  SegmentEffortCompareError,
  sliceEffort,
} from "../segmentEffortCompare";
import {
  getActivityStreams,
  getSegmentEffort,
  listSegmentEfforts,
  type StravaDetailedSegmentEffort,
  StreamsUnavailableError,
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import {
  CompareSegmentEffortsOutputSchema,
  warnOnSchemaDrift,
} from "./outputs";

const name = "compare-segment-efforts";

const description = `
Compares two of your efforts on the same segment to show WHERE the time went, not just how much.

view-segment-progress can tell you that you were 8 seconds off your PR. This
tool slices both efforts out of their activities' full-resolution streams,
aligns them on distance along the segment, and reports:
- Total time for each effort and the gap between them
- A per-third breakdown: time, pace, and average HR for each third of the segment
- Where the gap peaked in each direction, so you can see "went out too hard" versus "faded at the top"

Use Cases:
- "Did I lose that PR attempt early or on the climb at the end?"
- Compare today's effort against your personal best on the same segment
- Check whether a faster time came from a harder start or a stronger finish

Parameters:
- effortId (required): the effort to analyse. Get one from get-activity-segments-data (effortId) or list-segment-efforts
- compareToEffortId: a second effort id on the same segment
- compareToPr: set true to compare against your fastest recorded effort on the segment instead

Exactly one of compareToEffortId or compareToPr is required.

Notes:
- Both efforts must be on the same segment; the tool refuses to compare across segments
- Needs recorded streams on both activities — a manual entry has none
- compareToPr uses list-segment-efforts, which Strava restricts to subscribers
`;

const inputSchema = z.object({
  effortId: stravaIdInput("The segment effort to analyse."),
  compareToEffortId: stravaIdInput(
    "A second segment effort on the same segment to compare against.",
  ).optional(),
  compareToPr: z
    .boolean()
    .optional()
    .describe(
      "Compare against your fastest recorded effort on this segment instead of naming a second effort id.",
    ),
});

type CompareSegmentEffortsInput = z.infer<typeof inputSchema>;

const STREAM_TYPES = [
  "time",
  "distance",
  "heartrate",
  "velocity_smooth",
  "grade_smooth",
] as const;

/**
 * Full-resolution streams for the effort's activity. Strava's
 * `start_index`/`end_index` index the full-resolution stream, so no
 * `resolution` parameter may be sent — a downsampled response would slice the
 * wrong window. The 6 h stream cache keys on the full URL, so this entry is
 * distinct from the apps' downsampled one rather than colliding with it.
 */
async function fetchEffortSlice(
  token: string,
  effort: StravaDetailedSegmentEffort,
): Promise<EffortSlice | null> {
  const activityId = effort.activity?.id;
  if (!activityId) return null;

  let streams: Awaited<ReturnType<typeof getActivityStreams>>;
  try {
    streams = await getActivityStreams(token, activityId, STREAM_TYPES, {
      seriesType: "distance",
    });
  } catch (error) {
    if (error instanceof StreamsUnavailableError) return null;
    throw error;
  }

  const asNumbers = (key: string) => {
    const data = streams.get(key);
    return Array.isArray(data) ? (data as number[]) : undefined;
  };

  return sliceEffort(
    {
      ...(asNumbers("time") ? { time: asNumbers("time")! } : {}),
      ...(asNumbers("distance") ? { distance: asNumbers("distance")! } : {}),
      ...(asNumbers("heartrate") ? { heartrate: asNumbers("heartrate")! } : {}),
      ...(asNumbers("velocity_smooth")
        ? { velocity_smooth: asNumbers("velocity_smooth")! }
        : {}),
      ...(asNumbers("grade_smooth")
        ? { grade_smooth: asNumbers("grade_smooth")! }
        : {}),
    },
    effort.start_index,
    effort.end_index,
  );
}

const formatClock = (seconds: number) => {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
};

const formatPace = (secPerKm: number | null) =>
  secPerKm == null ? "—" : `${formatClock(secPerKm)} /km`;

const signed = (seconds: number) =>
  `${seconds > 0 ? "+" : seconds < 0 ? "−" : ""}${Math.abs(seconds).toFixed(1)} s`;

/** Your fastest recorded effort on the segment, excluding the one in hand. */
async function findPrEffort(
  token: string,
  segmentId: string,
  excludeEffortId: string,
): Promise<StravaDetailedSegmentEffort | null> {
  const efforts = await listSegmentEfforts(token, segmentId, { perPage: 200 });
  const candidates = efforts.filter(
    (effort) => String(effort.id) !== excludeEffortId,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, effort) =>
    effort.elapsed_time < best.elapsed_time ? effort : best,
  );
}

export const compareSegmentEffortsTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: CompareSegmentEffortsOutputSchema,
  execute: async (
    { effortId, compareToEffortId, compareToPr }: CompareSegmentEffortsInput,
    token: string,
  ) => {
    if (Boolean(compareToEffortId) === Boolean(compareToPr)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Input Error: provide exactly one of compareToEffortId or compareToPr.",
          },
        ],
        isError: true,
      };
    }

    try {
      const effort1 = await getSegmentEffort(token, effortId);
      const segmentId = String(effort1.segment?.id ?? "");

      const effort2 = compareToEffortId
        ? await getSegmentEffort(token, compareToEffortId)
        : await findPrEffort(token, segmentId, String(effort1.id));

      if (!effort2) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ You have only one recorded effort on "${effort1.name}", so there is nothing to compare it against.`,
            },
          ],
          isError: true,
        };
      }

      if (String(effort2.segment?.id ?? "") !== segmentId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Those efforts are on different segments ("${effort1.name}" and "${effort2.name}"), so their splits are not comparable. Use compare-activities for whole activities.`,
            },
          ],
          isError: true,
        };
      }

      const [slice1, slice2] = await Promise.all([
        fetchEffortSlice(token, effort1),
        fetchEffortSlice(token, effort2),
      ]);

      if (!slice1 || !slice2) {
        const which = !slice1 ? "first" : "second";
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ The ${which} effort has no usable recorded streams on this segment, so the two cannot be compared point by point. Manual activities record no samples, and some older activities have no stream indices.`,
            },
          ],
          isError: true,
        };
      }

      const comparison = compareEffortSlices(slice1, slice2);

      const structured = {
        segment_id: segmentId,
        segment_name: effort1.name,
        compared_distance_m: comparison.comparedDistanceM,
        effort_1: effortSummary(effort1, comparison.totalSeconds[0]),
        effort_2: effortSummary(effort2, comparison.totalSeconds[1]),
        total_delta_seconds: comparison.totalDeltaSeconds,
        thirds: comparison.thirds.map((third) => ({
          label: third.label,
          start_m: third.startM,
          end_m: third.endM,
          seconds: third.seconds,
          pace_sec_per_km: third.paceSecPerKm,
          avg_hr: third.avgHr,
          delta_seconds: third.deltaSeconds,
        })),
        delta_curve: comparison.deltaCurve.map((point) => ({
          distance_m: point.distanceM,
          delta_seconds: point.deltaSeconds,
        })),
        best_for_effort_2: comparison.bestForEffort2
          ? {
              distance_m: comparison.bestForEffort2.distanceM,
              delta_seconds: comparison.bestForEffort2.deltaSeconds,
            }
          : null,
        worst_for_effort_2: comparison.worstForEffort2
          ? {
              distance_m: comparison.worstForEffort2.distanceM,
              delta_seconds: comparison.worstForEffort2.deltaSeconds,
            }
          : null,
        warnings: comparison.warnings,
      };
      warnOnSchemaDrift(name, CompareSegmentEffortsOutputSchema, structured);

      const label1 = effortLabel(effort1);
      const label2 = effortLabel(effort2);
      const delta = comparison.totalDeltaSeconds;
      const lines = [
        `Segment Effort Comparison: ${effort1.name}`,
        `  Effort 1: ${label1} — ${formatClock(comparison.totalSeconds[0])}`,
        `  Effort 2: ${label2} — ${formatClock(comparison.totalSeconds[1])}`,
        `  Effort 2 was ${delta === 0 ? "level with" : delta < 0 ? `${Math.abs(delta).toFixed(1)} s faster than` : `${delta.toFixed(1)} s slower than`} effort 1 over ${comparison.comparedDistanceM} m`,
        "",
        "Per third:",
      ];

      for (const third of comparison.thirds) {
        lines.push(
          `  ${third.label.padEnd(6)} ${`${third.startM}–${third.endM} m`.padEnd(14)} ` +
            `${formatClock(third.seconds[0]).padStart(6)} vs ${formatClock(third.seconds[1]).padStart(6)}  ` +
            `${signed(third.deltaSeconds).padStart(9)}  ` +
            `(${formatPace(third.paceSecPerKm[0])} vs ${formatPace(third.paceSecPerKm[1])})` +
            (third.avgHr[0] != null && third.avgHr[1] != null
              ? `  HR ${third.avgHr[0]} vs ${third.avgHr[1]} bpm`
              : ""),
        );
      }

      const worst = comparison.worstForEffort2;
      const best = comparison.bestForEffort2;
      if (worst && best) {
        lines.push(
          "",
          `Gap peaked for effort 2 at ${best.distanceM} m (${signed(best.deltaSeconds)}) and was worst at ${worst.distanceM} m (${signed(worst.deltaSeconds)}).`,
          verdict(comparison.thirds[0]?.deltaSeconds ?? 0, delta),
        );
      }

      if (comparison.warnings.length > 0) {
        lines.push("");
        for (const warning of comparison.warnings) {
          lines.push(`Warning: ${warning}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof SegmentEffortCompareError) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error.message}` }],
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
              text: "❌ Strava restricts a segment's effort history to subscribers, so your PR on this segment cannot be looked up. Pass compareToEffortId with a second effort id instead.",
            },
          ],
          isError: true,
        };
      }
      console.error(`Error in ${name}:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to compare these segment efforts: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};

function effortSummary(
  effort: StravaDetailedSegmentEffort,
  comparedSeconds: number,
) {
  return {
    effort_id: String(effort.id),
    activity_id: String(effort.activity?.id ?? ""),
    date: effort.start_date_local,
    elapsed_time_s: effort.elapsed_time,
    compared_seconds: comparedSeconds,
    pr_rank: effort.pr_rank ?? null,
    avg_heartrate: effort.average_heartrate ?? null,
  };
}

function effortLabel(effort: StravaDetailedSegmentEffort): string {
  const date = effort.start_date_local?.slice(0, 10) ?? "unknown date";
  return `${date}${effort.pr_rank === 1 ? " (PR)" : ""} [effort ${effort.id}]`;
}

/**
 * The question the per-third table exists to answer: was the difference made
 * early or late? Reported only as a reading of the numbers above it.
 */
function verdict(firstThirdDelta: number, totalDelta: number): string {
  if (Math.abs(totalDelta) < 1) {
    return "The two efforts were effectively identical overall.";
  }
  const faster = totalDelta < 0 ? "Effort 2" : "Effort 1";
  // A first third that runs counter to the final result is the interesting case.
  if (totalDelta < 0 && firstThirdDelta > 0) {
    return `${faster} finished ahead despite starting slower — the time came late.`;
  }
  if (totalDelta > 0 && firstThirdDelta < 0) {
    return "Effort 2 started faster and still lost time — it went out too hard.";
  }
  return `${faster} was ahead from the start and stayed there.`;
}
