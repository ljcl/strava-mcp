import { formatDurationShort } from "@strava-mcp/data";
import { type SummaryStat } from "@strava-mcp/ui";
import { type TrainingLoadData, type WeekSummary } from "./types";

/**
 * Weekly totals arrive as fractional hours; the shared formatter takes
 * seconds. "27h 45m", "3h", "45m".
 */
export function formatHours(timeHours: number): string {
  return formatDurationShort(timeHours * 3600);
}

/** SummaryBar totals row: runs, distance, time, elevation. */
export function buildTotalsStats(
  totals: TrainingLoadData["totals"],
): SummaryStat[] {
  return [
    { label: "Runs", value: `${totals.runs}` },
    { label: "Distance", value: `${totals.distanceKm.toLocaleString()} km` },
    { label: "Time", value: formatHours(totals.timeHours) },
    {
      label: "Elevation",
      value: `${Math.round(totals.elevationM).toLocaleString()} m`,
    },
  ];
}

/** Count of weeks carrying at least one injury-risk warning. */
export function countWarningWeeks(weeks: WeekSummary[]): number {
  return weeks.filter((w) => w.warning).length;
}
