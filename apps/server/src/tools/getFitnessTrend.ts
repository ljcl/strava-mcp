import { z } from "zod";
import { buildFitnessTrend, type FitnessTrendDay } from "../fitnessTrend";
import { getAllActivities } from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { FitnessTrendOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "get-fitness-trend";

const description = `
Computes the fitness/fatigue/form trend (CTL, ATL, TSB) from Strava relative effort.

This tool builds the classic performance-management chart from the relative
effort (suffer score) already present on the activity list — no per-activity
fetches:
- CTL ("fitness"): 42-day exponentially weighted average of daily load
- ATL ("fatigue"): 7-day exponentially weighted average of daily load
- TSB ("form"): CTL − ATL. Negative = carrying fatigue, positive = fresh

Use Cases:
- "When does my form (TSB) return positive, and does it align with my next quality day?"
- Judge whether a training block is digging too deep (sustained very negative TSB)
- Time a taper: project forward assuming rest to find the fresh date

Parameters:
- days (optional): lookback window (default 90, max 365). CTL starts from zero
  at the window start, so keep this ≥ 90 for settled values
- activityTypes (optional): activity types to include. Omit to include ALL
  activities — relative effort is HR-based and cross-sport, so whole-body load
  is usually what you want. Pass e.g. ["Run"] to isolate one sport
- projectDays (optional, default 0, max 60): also project TSB forward assuming
  zero load, answering "when do I return to fresh if I rest?"

Notes:
- Values are directionally consistent with TRIMP-based CTL/ATL from other
  platforms but not absolutely comparable (relative effort ≠ TRIMP)
- Activities without a relative effort (no HR recorded) contribute zero load
  and are counted in the response so the gap is visible
- Each value is stamped with the local calendar date it was computed for
`;

const inputSchema = z.object({
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .default(90)
    .describe(
      "Days to look back (default 90; CTL needs ~90 days of runway, max 365)",
    ),
  activityTypes: z
    .array(z.string())
    .optional()
    .describe(
      "Activity types to include (e.g. ['Run', 'TrailRun']). Omit for all types — cross-sport load is usually what TSB should reflect.",
    ),
  projectDays: z
    .number()
    .int()
    .min(0)
    .max(60)
    .default(0)
    .describe(
      "Project TSB this many days forward assuming zero load (default 0 = no projection)",
    ),
});

type GetFitnessTrendInput = z.infer<typeof inputSchema>;

const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

function formatDay(day: FitnessTrendDay): string {
  return `  ${day.date}: load ${day.load}, CTL ${day.ctl}, ATL ${day.atl}, TSB ${signed(day.tsb)}`;
}

export const getFitnessTrendTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: FitnessTrendOutputSchema,
  execute: async ({
    days,
    activityTypes,
    projectDays,
  }: GetFitnessTrendInput) => {
    const token = process.env.STRAVA_ACCESS_TOKEN;

    if (!token) {
      console.error("Missing STRAVA_ACCESS_TOKEN environment variable.");
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
      console.error(`Fetching fitness trend for last ${days} days...`);

      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - days * 24 * 60 * 60 * 1000,
      );

      const allActivities = await getAllActivities(token, {
        after: Math.floor(startDate.getTime() / 1000),
        before: Math.floor(endDate.getTime() / 1000),
      });

      const activities =
        activityTypes && activityTypes.length > 0
          ? allActivities.filter((a) =>
              activityTypes.includes(a.type ?? a.sport_type ?? ""),
            )
          : allActivities;

      const missingLoad = activities.filter(
        (a) => a.suffer_score == null,
      ).length;

      const trend = buildFitnessTrend(activities, {
        endDate: endDate.toISOString().split("T")[0]!,
        days,
        projectDays,
      });

      const warnings: string[] = [];
      if (activities.length === 0) {
        warnings.push(
          "No matching activities in the window — the trend is all zeros.",
        );
      } else if (missingLoad > 0) {
        warnings.push(
          `${missingLoad} of ${activities.length} activities have no relative effort (no heart rate?) and contributed zero load.`,
        );
      }
      if (days < 90) {
        warnings.push(
          `A ${days}-day window gives CTL little runway (it starts from zero); values early in the window under-read true fitness.`,
        );
      }

      // 7-day deltas for a quick direction read.
      const series = trend.days;
      const weekAgo = series.length >= 8 ? series[series.length - 8]! : null;
      const current = trend.current;
      const trendSummary =
        current && weekAgo
          ? {
              ctl_7d_delta: Math.round((current.ctl - weekAgo.ctl) * 10) / 10,
              tsb_7d_delta: Math.round((current.tsb - weekAgo.tsb) * 10) / 10,
            }
          : null;

      const result = {
        period: {
          days,
          start_date: series[0]?.date ?? "",
          end_date: current?.date ?? "",
        },
        current: current
          ? {
              date: current.date,
              ctl: current.ctl,
              atl: current.atl,
              tsb: current.tsb,
            }
          : null,
        trend: trendSummary,
        flags: trend.flags,
        warnings,
        daily: series,
        projection: trend.projection,
        tsb_positive_date: trend.tsbPositiveDate,
        activities_included: activities.length,
        activities_missing_load: missingLoad,
      };

      let output = `📈 **Fitness Trend (CTL/ATL/TSB)**\n`;
      output += `📅 ${result.period.start_date} to ${result.period.end_date} (${days} days, ${activities.length} activities)\n\n`;

      if (current) {
        output += `**Current (${current.date})**\n`;
        output += `  Fitness (CTL): ${current.ctl}\n`;
        output += `  Fatigue (ATL): ${current.atl}\n`;
        output += `  Form (TSB): ${signed(current.tsb)}\n\n`;
      }

      if (trendSummary) {
        output += `**Last 7 days**: CTL ${signed(trendSummary.ctl_7d_delta)}, TSB ${signed(trendSummary.tsb_7d_delta)}\n\n`;
      }

      if (trend.flags.length > 0) {
        output += `**⚠️ Flags**\n`;
        for (const flag of trend.flags) {
          output += `  - ${flag}\n`;
        }
        output += `\n`;
      }

      if (projectDays > 0) {
        output += `**Rest projection (${projectDays} days, zero load)**\n`;
        output += trend.tsbPositiveDate
          ? `  TSB returns positive on ${trend.tsbPositiveDate}\n`
          : `  TSB stays negative for the whole projection\n`;
        const last = trend.projection[trend.projection.length - 1];
        if (last) {
          output += `  End of projection (${last.date}): CTL ${last.ctl}, TSB ${signed(last.tsb)}\n`;
        }
        output += `\n`;
      }

      const recent = series.slice(-14);
      if (recent.length > 0) {
        output += `**Last ${recent.length} days** (full series in structured output)\n`;
        for (const day of recent) {
          output += `${formatDay(day)}\n`;
        }
        output += `\n`;
      }

      for (const warning of warnings) {
        output += `Note: ${warning}\n`;
      }
      output += `Note: relative-effort CTL/ATL is directionally consistent with TRIMP-based values, not absolutely comparable.\n`;

      console.error(`Successfully generated fitness trend for ${days} days`);

      warnOnSchemaDrift(name, FitnessTrendOutputSchema, result);

      return {
        content: [{ type: "text" as const, text: output }],
        structuredContent: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching fitness trend: ${errorMessage}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `❌ An unexpected error occurred while computing the fitness trend. Details: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
