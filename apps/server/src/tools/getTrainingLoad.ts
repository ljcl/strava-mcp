import { z } from "zod";
import { getAllActivities } from "../stravaClient";
import { formatDuration } from "../utils/running";

const name = "get-training-load";

const description = `
Retrieves training load summary for a specified time period.

This tool aggregates running activities to provide:
- Total and weekly volume (distance, time, elevation)
- Training trend analysis (increasing, stable, decreasing)
- Warnings for sudden volume increases (injury risk)

Use Cases:
- Monitor weekly training volume
- Track training consistency over time
- Identify potential overtraining risks
- Review training history for periodization planning

Parameters:
- days (optional): Number of days to analyze (default: 28, i.e., 4 weeks)
- activityTypes (optional): Activity types to include (default: Run, TrailRun, VirtualRun)

Notes:
- Trend is calculated by comparing recent 2 weeks vs previous 2 weeks
- Warnings are generated for >30% week-over-week volume increases
`;

const inputSchema = z.object({
  days: z
    .number()
    .int()
    .positive()
    .default(28)
    .describe("Number of days to look back (default: 28 for 4 weeks)"),
  activityTypes: z
    .array(z.string())
    .default(["Run", "TrailRun", "VirtualRun"])
    .describe("Activity types to include in analysis"),
});

type GetTrainingLoadInput = z.infer<typeof inputSchema>;

interface WeekData {
  runs: number;
  distance_m: number;
  time_seconds: number;
  elevation_m: number;
  activities: Array<{
    id: number;
    name: string;
    date: string;
    distance_km: number;
  }>;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  return d.toISOString().split("T")[0]!;
}

function generateWarnings(
  weeklyBreakdown: Array<{ week_starting: string; distance_km: number }>,
): string[] {
  const warnings: string[] = [];

  if (weeklyBreakdown.length < 2) {
    return warnings;
  }

  // Check for sudden volume increases (>30% week over week)
  for (let i = 1; i < weeklyBreakdown.length; i += 1) {
    const prevDist = weeklyBreakdown[i - 1]!.distance_km;
    const currDist = weeklyBreakdown[i]!.distance_km;

    if (prevDist > 0 && currDist > prevDist * 1.3) {
      const increase = Math.round((currDist / prevDist - 1) * 100);
      warnings.push(
        `Week of ${weeklyBreakdown[i]!.week_starting}: Volume increased ${increase}% from previous week - consider injury risk`,
      );
    }
  }

  // Check for very high weeks compared to average
  const avgDistance =
    weeklyBreakdown.reduce((sum, w) => sum + w.distance_km, 0) /
    weeklyBreakdown.length;

  for (const week of weeklyBreakdown) {
    if (week.distance_km > avgDistance * 1.5 && week.distance_km > 30) {
      warnings.push(
        `Week of ${week.week_starting}: Unusually high volume (${week.distance_km} km vs ${Math.round(avgDistance)} km average)`,
      );
    }
  }

  return warnings;
}

export const getTrainingLoadTool = {
  name,
  description,
  inputSchema,
  execute: async ({ days, activityTypes }: GetTrainingLoadInput) => {
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
      console.error(`Fetching training load for last ${days} days...`);

      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - days * 24 * 60 * 60 * 1000,
      );

      // Fetch all activities in the date range
      const allActivities = await getAllActivities(token, {
        after: Math.floor(startDate.getTime() / 1000),
        before: Math.floor(endDate.getTime() / 1000),
      });

      // Filter to requested activity types
      const activities = allActivities.filter((a) =>
        activityTypes.includes(a.type || a.sport_type),
      );

      // Group by week
      const weeks = new Map<string, WeekData>();

      for (const activity of activities) {
        const activityDate = new Date(
          activity.start_date_local || activity.start_date,
        );
        const weekKey = getWeekStart(activityDate);

        if (!weeks.has(weekKey)) {
          weeks.set(weekKey, {
            runs: 0,
            distance_m: 0,
            time_seconds: 0,
            elevation_m: 0,
            activities: [],
          });
        }

        const week = weeks.get(weekKey)!;
        week.runs += 1;
        week.distance_m += activity.distance || 0;
        week.time_seconds += activity.moving_time || 0;
        week.elevation_m += activity.total_elevation_gain || 0;
        week.activities.push({
          id: activity.id,
          name: activity.name,
          date: (activity.start_date_local || activity.start_date).split(
            "T",
          )[0],
          distance_km: Math.round((activity.distance || 0) / 10) / 100,
        });
      }

      // Sort weeks chronologically and format
      const sortedWeeks = Array.from(weeks.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, data]) => ({
          week_starting: weekStart,
          runs: data.runs,
          distance_km: Math.round(data.distance_m / 10) / 100,
          time_hours: Math.round((data.time_seconds / 3600) * 100) / 100,
          time_formatted: formatDuration(data.time_seconds),
          elevation_m: Math.round(data.elevation_m),
          activities: data.activities,
        }));

      // Calculate totals
      const totalRuns = sortedWeeks.reduce((sum, w) => sum + w.runs, 0);
      const totalDistanceKm = sortedWeeks.reduce(
        (sum, w) => sum + w.distance_km,
        0,
      );
      const totalTimeHours = sortedWeeks.reduce(
        (sum, w) => sum + w.time_hours,
        0,
      );
      const totalElevation = sortedWeeks.reduce(
        (sum, w) => sum + w.elevation_m,
        0,
      );
      const numWeeks = sortedWeeks.length || 1;

      // Calculate trend (compare last 2 weeks to previous 2 weeks)
      let trend = "insufficient data";
      if (sortedWeeks.length >= 4) {
        const recentDistance =
          sortedWeeks[sortedWeeks.length - 1]!.distance_km +
          sortedWeeks[sortedWeeks.length - 2]!.distance_km;
        const previousDistance =
          sortedWeeks[sortedWeeks.length - 3]!.distance_km +
          sortedWeeks[sortedWeeks.length - 4]!.distance_km;

        if (previousDistance > 0) {
          const change =
            ((recentDistance - previousDistance) / previousDistance) * 100;
          if (change > 15) trend = "increasing significantly";
          else if (change > 5) trend = "increasing";
          else if (change < -15) trend = "decreasing significantly";
          else if (change < -5) trend = "decreasing";
          else trend = "stable";
        }
      } else if (sortedWeeks.length >= 2) {
        trend = "limited data - need 4+ weeks for trend";
      }

      // Generate warnings
      const warnings = generateWarnings(sortedWeeks);

      const result = {
        period: {
          days,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        },
        totals: {
          runs: totalRuns,
          distance_km: Math.round(totalDistanceKm * 100) / 100,
          time_hours: Math.round(totalTimeHours * 100) / 100,
          elevation_m: totalElevation,
        },
        averages: {
          runs_per_week: Math.round((totalRuns / numWeeks) * 10) / 10,
          distance_km_per_week:
            Math.round((totalDistanceKm / numWeeks) * 100) / 100,
          time_hours_per_week:
            Math.round((totalTimeHours / numWeeks) * 100) / 100,
        },
        trend,
        weekly_breakdown: sortedWeeks,
        warnings,
      };

      // Format as readable text
      let output = `📊 **Training Load Summary**\n`;
      output += `📅 ${result.period.start_date} to ${result.period.end_date} (${days} days)\n\n`;

      output += `**Totals**\n`;
      output += `  Runs: ${result.totals.runs}\n`;
      output += `  Distance: ${result.totals.distance_km} km\n`;
      output += `  Time: ${Math.floor(result.totals.time_hours)}h ${Math.round((result.totals.time_hours % 1) * 60)}m\n`;
      output += `  Elevation: ${result.totals.elevation_m} m\n\n`;

      output += `**Weekly Averages**\n`;
      output += `  Runs/week: ${result.averages.runs_per_week}\n`;
      output += `  Distance/week: ${result.averages.distance_km_per_week} km\n`;
      output += `  Time/week: ${result.averages.time_hours_per_week} hours\n\n`;

      output += `**Trend**: ${result.trend}\n\n`;

      if (result.warnings.length > 0) {
        output += `**⚠️ Warnings**\n`;
        for (const warning of result.warnings) {
          output += `  - ${warning}\n`;
        }
        output += `\n`;
      }

      output += `**Weekly Breakdown**\n`;
      for (const week of result.weekly_breakdown) {
        output += `  Week of ${week.week_starting}: ${week.runs} runs, ${week.distance_km} km, ${week.time_formatted}\n`;
      }

      console.error(`Successfully generated training load for ${days} days`);

      return {
        content: [
          { type: "text" as const, text: output },
          {
            type: "text" as const,
            text: `\n**Raw Data:**\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching training load: ${errorMessage}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `❌ An unexpected error occurred while fetching training load. Details: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
