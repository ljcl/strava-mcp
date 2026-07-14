import { type SummaryStat } from "@strava-mcp/ui";
import { type TrainingLoadData, type WeekSummary } from "./types";

/** Format fractional hours as "27h 45m" (or "45m" under an hour). */
export function formatHours(timeHours: number): string {
  const totalMinutes = Math.round(timeHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
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
