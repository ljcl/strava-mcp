const METRIC_LABELS: Record<string, string> = {
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
}

export function buildChartContextSummary(
  input: ChartContextInput,
): string | null {
  const { activityName, availableMetrics, hidden, smooth } = input;
  if (!activityName || availableMetrics.length === 0) return null;

  const label = (k: string) => METRIC_LABELS[k] ?? k;
  const shown = availableMetrics.filter((m) => !hidden.has(m)).map(label);
  const off = availableMetrics.filter((m) => hidden.has(m)).map(label);

  const parts = [`Viewing activity "${activityName}".`];
  parts.push(shown.length ? `Showing: ${shown.join(", ")}.` : "Showing: none.");
  if (off.length) parts.push(`Hidden: ${off.join(", ")}.`);
  parts.push(`Smoothing: ${smooth ? "on" : "off"}.`);
  return parts.join(" ");
}
