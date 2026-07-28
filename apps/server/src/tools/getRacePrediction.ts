import { z } from "zod";
import { RateLimitError } from "../fetchClient";
import { formatDuration } from "../formatters";
import {
  buildSplits,
  formatPaceSeconds,
  formatRaceTime,
  NEGATIVE_SPLIT_PCT,
  parseGoalTime,
  predictRace,
  RACE_DISTANCES,
  type RaceDistanceName,
  racePace,
  type SourceEffort,
  type SplitPlan,
  STANDARD_TARGETS,
  selectSourceEfforts,
} from "../racePrediction";
import {
  getActivityById,
  getAllActivities,
  type StravaSummaryActivity,
} from "../stravaClient";
import { mapWithConcurrency } from "../utils/concurrency";
import { READ_ONLY } from "./_annotations";
import { RacePredictionOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-race-prediction";

const description = `
Predicts race times from your recorded best efforts and builds a goal-pace split table.

Uses Riegel's equivalent-performance formula (T2 = T1 × (D2/D1)^1.06) over the
best efforts Strava records inside each run, combining them into one estimate
per distance weighted by how recent each effort is and how far it has to be
extrapolated.

Use Cases:
- "I am racing a half in six weeks — what should I target, and what is my km split?"
- Sanity-check a goal time against what your training actually supports
- See which effort is driving a prediction, and how much your distances disagree

Parameters:
- raceDistance (optional): the race you are planning ("5K", "10K", "15K", "10 mile",
  "Half Marathon", "Marathon", "50K"). Supply it to get the split table; omit it
  for the equivalent-performance table alone
- goalTime (optional): pace the splits to your own goal instead of the prediction
  ("1:45:00", "45:30", "1h45m"). Requires raceDistance
- maxActivities (optional): activities to scan (default 100, max 200)
- after / before (optional): scope the scan to a date window (ISO date or date-time)

Notes:
- Riegel is an extrapolation, not a measurement. Every prediction carries a
  confidence grade, the effort that drives it, and the spread across sources
- Efforts under 1500 m are excluded — outside the range the formula fits
- It assumes appropriate training for the distance; it cannot know whether you
  have done the long runs a marathon needs
- Scanning fetches each activity's detail, so it makes one API call per activity.
  Prefer after/before to scope a season over raising maxActivities
- If the rate limit is reached part-way, the scan stops and the response says
  how many activities were skipped rather than predicting from a partial set
`;

/** ISO date (`2026-01-31`) or full date-time, converted to an epoch second. */
const isoDateInput = (what: string) =>
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Must be an ISO date (2026-01-31) or date-time",
    })
    .optional()
    .describe(what);

const RACE_DISTANCE_NAMES = Object.keys(RACE_DISTANCES) as [
  RaceDistanceName,
  ...RaceDistanceName[],
];

const inputSchema = z.object({
  raceDistance: z
    .enum(RACE_DISTANCE_NAMES)
    .optional()
    .describe(
      "The race being planned. Supply it to get a km/mile split table; omit for predictions only.",
    ),
  goalTime: z
    .string()
    .optional()
    .describe(
      "Pace the splits to this target instead of the prediction ('1:45:00', '45:30', '1h45m'). Needs raceDistance.",
    ),
  maxActivities: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of activities to scan (default: 100, max: 200)"),
  after: isoDateInput(
    "Only scan activities on or after this date — scope a season instead of scanning by count.",
  ),
  before: isoDateInput("Only scan activities on or before this date."),
});

type GetRacePredictionInput = z.infer<typeof inputSchema>;

const RUNNING_TYPES = ["Run", "TrailRun", "VirtualRun"];

const isRunningActivity = (a: StravaSummaryActivity) =>
  RUNNING_TYPES.includes(a.type ?? a.sport_type ?? "");

/** Matches `get-best-efforts` — one detail request per activity, capped. */
const FETCH_CONCURRENCY = 5;

const CONFIDENCE_ICON = { high: "🟢", medium: "🟡", low: "🔴" } as const;

const NO_PACE = { min_per_km: "N/A", min_per_mile: "N/A" };

/** `racePace` speaks camelCase; the payload is snake_case. */
function paceFields(seconds: number, distanceMeters: number) {
  const pace = racePace(seconds, distanceMeters);
  return pace
    ? { min_per_km: pace.minPerKm, min_per_mile: pace.minPerMile }
    : NO_PACE;
}

const serializeSource = (source: SourceEffort) => ({
  name: source.name,
  distance_m: Math.round(source.distanceMeters * 10) / 10,
  elapsed_time_seconds: source.elapsedSeconds,
  elapsed_time_formatted: formatDuration(source.elapsedSeconds),
  date: source.date,
  activity_id: source.activityId,
  activity_name: source.activityName,
});

const serializeSplitPlan = (plan: SplitPlan) => ({
  unit: plan.unit,
  strategy:
    plan.negativeSplitPct > 0 ? ("negative" as const) : ("even" as const),
  negative_split_pct: plan.negativeSplitPct,
  total_seconds: plan.totalSeconds,
  total_formatted: formatRaceTime(plan.totalSeconds),
  splits: plan.splits.map((split) => ({
    index: split.index,
    cumulative_m: split.cumulativeMeters,
    segment_m: split.segmentMeters,
    split_seconds: split.splitSeconds,
    split_formatted: formatRaceTime(split.splitSeconds),
    cumulative_seconds: split.cumulativeSeconds,
    cumulative_formatted: formatRaceTime(split.cumulativeSeconds),
    pace_per_unit: formatPaceSeconds(split.paceSecPerUnit),
  })),
});

/**
 * Column header for `renderSplitTable`. Padded to line up with the rows it
 * emits: index+unit occupy 7 chars, split ends at 16, cumulative at 27.
 */
const SPLIT_TABLE_HEADER = `${" ".repeat(11)}split cumulative\n`;

/** Rows for one split table, aligned so the columns read as a table. */
function renderSplitTable(plan: SplitPlan): string {
  const unitLabel = plan.unit === "km" ? "km" : "mi";
  let out = "";
  for (const split of plan.splits) {
    const partial =
      split.segmentMeters < (plan.unit === "km" ? 999 : 1608)
        ? ` (${Math.round(split.segmentMeters)} m)`
        : "";
    out += `  ${String(split.index).padStart(2, " ")} ${unitLabel}  ${formatRaceTime(
      split.splitSeconds,
    ).padStart(
      7,
      " ",
    )}   ${formatRaceTime(split.cumulativeSeconds).padStart(8, " ")}${partial}\n`;
  }
  return out;
}

export const getRacePredictionTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: RacePredictionOutputSchema,
  execute: async (
    {
      raceDistance,
      goalTime,
      maxActivities,
      after,
      before,
    }: GetRacePredictionInput,
    token: string,
  ) => {
    try {
      // Reject a bad goal time before spending a 100-activity scan on it.
      const goalSeconds =
        goalTime !== undefined ? parseGoalTime(goalTime) : null;
      if (goalTime !== undefined && goalSeconds === null) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Could not read "${goalTime}" as a race time. Use H:MM:SS ("1:45:00"), MM:SS ("45:30"), or shorthand ("1h45m").`,
            },
          ],
          isError: true,
        };
      }

      console.error(
        `Predicting races (scanning up to ${maxActivities} activities)...`,
      );

      const allActivities = await getAllActivities(token, {
        perPage: Math.min(maxActivities, 200),
        maxItems: maxActivities,
        countActivity: isRunningActivity,
        ...(after ? { after: Math.floor(Date.parse(after) / 1000) } : {}),
        ...(before ? { before: Math.floor(Date.parse(before) / 1000) } : {}),
      });

      const runningActivities = allActivities
        .filter(isRunningActivity)
        .slice(0, maxActivities);

      const efforts: SourceEffort[] = [];
      let activitiesWithEfforts = 0;
      let activitiesRead = 0;
      let failedFetches = 0;
      // A 429 means the quota is genuinely spent. Continuing would burn the
      // rest of the scan on requests that cannot succeed, so it stops and the
      // response says the prediction rests on a partial set.
      const abort: { rateLimit: RateLimitError | null } = { rateLimit: null };

      await mapWithConcurrency(
        runningActivities,
        FETCH_CONCURRENCY,
        async (summary) => {
          let activity: Awaited<ReturnType<typeof getActivityById>>;
          try {
            activity = await getActivityById(token, summary.id);
          } catch (err) {
            if (err instanceof RateLimitError) {
              abort.rateLimit ??= err;
            } else {
              failedFetches += 1;
              console.error(`Failed to fetch activity ${summary.id}: ${err}`);
            }
            return;
          }

          activitiesRead += 1;
          if (!activity.best_efforts || activity.best_efforts.length === 0) {
            return;
          }
          activitiesWithEfforts += 1;

          for (const effort of activity.best_efforts) {
            efforts.push({
              name: effort.name,
              distanceMeters: effort.distance || 0,
              elapsedSeconds: effort.elapsed_time || 0,
              date: (effort.start_date_local || effort.start_date || "").split(
                "T",
              )[0]!,
              activityId: activity.id,
              activityName: activity.name,
            });
          }
        },
        () => abort.rateLimit !== null,
      );

      const referenceDate = new Date().toISOString().split("T")[0]!;
      const sources = selectSourceEfforts(efforts, referenceDate);

      const skipped = runningActivities.length - activitiesRead;
      const warnings: string[] = [];
      if (abort.rateLimit) {
        warnings.push(
          `Strava's rate limit was reached part-way through the scan, so ${skipped} of ${runningActivities.length} activities were not read. The predictions below rest on a partial set of efforts. ${abort.rateLimit.message} Retry after the window resets, or narrow the scan with after/before.`,
        );
      } else if (failedFetches > 0) {
        warnings.push(
          `${failedFetches} activit${failedFetches === 1 ? "y" : "ies"} could not be fetched, so any efforts they hold are missing from the inputs.`,
        );
      }

      // The requested race joins the standard table when it is not already in it.
      const targetNames: RaceDistanceName[] = [...STANDARD_TARGETS];
      if (raceDistance && !targetNames.includes(raceDistance)) {
        targetNames.push(raceDistance);
      }
      targetNames.sort((a, b) => RACE_DISTANCES[a] - RACE_DISTANCES[b]);

      const predictions = targetNames
        .map((label) =>
          predictRace(sources, RACE_DISTANCES[label], label, referenceDate),
        )
        .filter((p) => p !== null);

      const method =
        "Riegel T2 = T1 × (D2/D1)^1.06 over recorded best efforts, weighted by recency (90-day half-life) and extrapolation distance. Assumes training appropriate to the distance.";

      if (sources.length === 0) {
        const reason =
          activitiesRead === 0
            ? "No running activities were read."
            : "No recorded best efforts of 1500 m or longer were found — Strava records best efforts on GPS-recorded runs, and efforts shorter than 1500 m are outside Riegel's range.";
        const response = {
          predictions: [],
          target: null,
          sources: [],
          activities_analyzed: activitiesRead,
          activities_with_efforts: activitiesWithEfforts,
          activities_skipped: skipped,
          warnings: [...warnings, reason],
          method,
        };
        warnOnSchemaDrift(name, RacePredictionOutputSchema, response);

        let text = `🏁 **Race Prediction**\n`;
        text += `📊 Analyzed ${activitiesRead} activities\n\n`;
        text += `Not enough to predict from. ${reason}\n`;
        text += `Try raising maxActivities, or widening after/before.\n`;
        for (const warning of warnings) text += `\n⚠️ ${warning}\n`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: response,
        };
      }

      // ---- target race: splits, paced to the goal when one was given ----
      let target: {
        distance: string;
        distance_m: number;
        basis: "goal" | "predicted";
        total_seconds: number;
        total_formatted: string;
        pace: { min_per_km: string; min_per_mile: string };
        goal_vs_predicted_seconds: number | null;
        goal_assessment: string | null;
        splits: ReturnType<typeof serializeSplitPlan>[];
      } | null = null;

      let targetPlans: SplitPlan[] = [];

      if (raceDistance) {
        const targetMeters = RACE_DISTANCES[raceDistance];
        const predicted = predictions.find((p) => p.label === raceDistance);
        const totalSeconds = goalSeconds ?? predicted?.predictedSeconds ?? 0;

        if (totalSeconds > 0) {
          targetPlans = [
            buildSplits(totalSeconds, targetMeters, "km"),
            buildSplits(totalSeconds, targetMeters, "mile"),
            buildSplits(totalSeconds, targetMeters, "km", NEGATIVE_SPLIT_PCT),
          ];

          const delta =
            goalSeconds !== null && predicted
              ? goalSeconds - predicted.predictedSeconds
              : null;
          let assessment: string | null = null;
          if (delta !== null && predicted) {
            const gap = Math.abs(delta);
            const pct = (gap / predicted.predictedSeconds) * 100;
            if (delta > 0 && pct >= 2) {
              assessment = `Your goal is ${formatRaceTime(gap)} slower than the ${formatRaceTime(predicted.predictedSeconds)} your efforts predict — a conservative target you should be able to hold.`;
            } else if (pct < 2) {
              assessment = `Your goal is within ${formatRaceTime(gap)} of the ${formatRaceTime(predicted.predictedSeconds)} predicted — right on what your efforts support.`;
            } else if (pct < 6) {
              assessment = `Your goal is ${formatRaceTime(gap)} faster than the ${formatRaceTime(predicted.predictedSeconds)} predicted (${pct.toFixed(1)}%) — a stretch that needs the race to go right.`;
            } else {
              assessment = `Your goal is ${formatRaceTime(gap)} faster than the ${formatRaceTime(predicted.predictedSeconds)} predicted (${pct.toFixed(1)}%) — well beyond what your recorded efforts support. Going out at this pace risks blowing up.`;
            }
          }

          target = {
            distance: raceDistance,
            distance_m: targetMeters,
            basis: goalSeconds !== null ? "goal" : "predicted",
            total_seconds: totalSeconds,
            total_formatted: formatRaceTime(totalSeconds),
            pace: paceFields(totalSeconds, targetMeters),
            goal_vs_predicted_seconds: delta,
            goal_assessment: assessment,
            splits: targetPlans.map(serializeSplitPlan),
          };
        }
      }

      const response = {
        predictions: predictions.map((p) => ({
          distance: p.label,
          distance_m: p.distanceMeters,
          predicted_seconds: p.predictedSeconds,
          predicted_formatted: formatRaceTime(p.predictedSeconds),
          pace: paceFields(p.predictedSeconds, p.distanceMeters),
          confidence: p.confidence,
          confidence_notes: p.confidenceNotes,
          primary_source: serializeSource(p.primary.source),
          spread: p.spread
            ? {
                fastest_seconds: p.spread.fastestSeconds,
                slowest_seconds: p.spread.slowestSeconds,
                range_seconds: p.spread.rangeSeconds,
                range_pct: p.spread.rangePct,
              }
            : null,
          contributions: p.contributions.map((c) => ({
            source: serializeSource(c.source),
            predicted_seconds: c.predictedSeconds,
            predicted_formatted: formatRaceTime(c.predictedSeconds),
            age_days: c.ageDays,
            weight: c.weight,
          })),
        })),
        target,
        sources: sources.map(serializeSource),
        activities_analyzed: activitiesRead,
        activities_with_efforts: activitiesWithEfforts,
        activities_skipped: skipped,
        warnings,
        method,
      };

      // ---- text ----
      let output = `🏁 **Race Prediction**\n`;
      output += `📊 Analyzed ${activitiesRead} activities (${activitiesWithEfforts} with best efforts, ${sources.length} used as inputs)\n`;
      if (skipped > 0) {
        output += `⚠️ ${skipped} activit${skipped === 1 ? "y" : "ies"} skipped — predictions rest on a partial set\n`;
      }
      output += `\n**Equivalent performances**\n`;
      for (const p of predictions) {
        const pace = racePace(p.predictedSeconds, p.distanceMeters);
        output += `  ${CONFIDENCE_ICON[p.confidence]} ${p.label.padEnd(14, " ")} ${formatRaceTime(p.predictedSeconds)}`;
        if (pace) output += `  (${pace.minPerKm} /km, ${pace.minPerMile} /mi)`;
        output += `\n`;
        output += `     from ${p.primary.source.name} in ${formatDuration(p.primary.source.elapsedSeconds)} on ${p.primary.source.date}`;
        if (p.spread && p.spread.rangeSeconds > 0) {
          output += `; sources range ${formatRaceTime(p.spread.fastestSeconds)}–${formatRaceTime(p.spread.slowestSeconds)}`;
        }
        output += `\n`;
      }

      output += `\n**Confidence**\n`;
      for (const p of predictions) {
        output += `  ${CONFIDENCE_ICON[p.confidence]} ${p.label}: ${p.confidence}\n`;
        for (const note of p.confidenceNotes) {
          output += `     - ${note}\n`;
        }
      }

      if (target) {
        const [kmPlan, milePlan, negativePlan] = targetPlans;
        output += `\n**${target.distance} target: ${target.total_formatted}** `;
        output += target.basis === "goal" ? `(your goal)\n` : `(predicted)\n`;
        output += `   ${target.pace.min_per_km} /km · ${target.pace.min_per_mile} /mi\n`;
        if (target.goal_assessment) {
          output += `   ${target.goal_assessment}\n`;
        }

        if (kmPlan) {
          output += `\n_Even splits — kilometres_\n`;
          output += SPLIT_TABLE_HEADER;
          output += renderSplitTable(kmPlan);
        }
        if (milePlan) {
          output += `\n_Even splits — miles_\n`;
          output += SPLIT_TABLE_HEADER;
          output += renderSplitTable(milePlan);
        }
        if (negativePlan) {
          output += `\n_Negative split (${(NEGATIVE_SPLIT_PCT * 100).toFixed(0)}% either side of halfway) — kilometres_\n`;
          output += SPLIT_TABLE_HEADER;
          output += renderSplitTable(negativePlan);
        }
      } else {
        output += `\nPass raceDistance to get a km and mile split table (and goalTime to pace it to your own target).\n`;
      }

      output += `\n**Inputs** (best efforts used)\n`;
      for (const source of sources) {
        output += `  ${source.name}: ${formatDuration(source.elapsedSeconds)} on ${source.date} — ${source.activityName}\n`;
      }

      for (const warning of warnings) {
        output += `\n⚠️ ${warning}\n`;
      }
      output += `\nℹ️ ${method}\n`;

      console.error(
        `Successfully predicted ${predictions.length} race distances from ${sources.length} efforts`,
      );

      warnOnSchemaDrift(name, RacePredictionOutputSchema, response);

      return {
        content: [{ type: "text" as const, text: output }],
        structuredContent: response,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error predicting race times: ${errorMessage}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `❌ An unexpected error occurred while predicting race times. Details: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
