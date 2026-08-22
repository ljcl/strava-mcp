/** Human names for the metric keys, shared with the a11y narration
 * so the legend, the model context, and the screen reader agree. */
export const METRIC_LABELS: Record<string, string> = {
  heartrate: "heart rate",
  power: "power",
  pace: "pace",
  altitude: "altitude",
  cadence: "cadence",
  grade: "grade",
};

export interface ChartContextInput {
  activityName: string | null;
  availableMetrics: string[];
  hidden: Set<string>;
  smooth: boolean;
  /**
   * The x-axis window currently shown, when zoomed. Echoed back so a
   * model that called `set-brush-window` — or a user who dragged the handles —
   * knows which part of the run the next question is about.
   */
  zoomWindow?: string | null;
}

export function buildChartContextSummary(
  input: ChartContextInput,
): string | null {
  const { activityName, availableMetrics, hidden, smooth, zoomWindow } = input;
  if (!activityName || availableMetrics.length === 0) return null;

  const label = (k: string) => METRIC_LABELS[k] ?? k;
  const shown = availableMetrics.filter((m) => !hidden.has(m)).map(label);
  const off = availableMetrics.filter((m) => hidden.has(m)).map(label);

  const parts = [`Viewing activity "${activityName}".`];
  parts.push(shown.length ? `Showing: ${shown.join(", ")}.` : "Showing: none.");
  if (off.length) parts.push(`Hidden: ${off.join(", ")}.`);
  parts.push(`Smoothing: ${smooth ? "on" : "off"}.`);
  if (zoomWindow) parts.push(`Zoomed to ${zoomWindow}.`);
  return parts.join(" ");
}
