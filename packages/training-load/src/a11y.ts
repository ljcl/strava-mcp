import { type WeekSummary } from "./types";

/**
 * Screen-reader narration for the training-load chart (#28). Recharts'
 * accessibilityLayer provides keyboard focus and arrow-key tooltip stepping,
 * but the SVG carries no accessible name or content summary of its own; this
 * builder feeds the chart's `title`/`desc` props (rendered as SVG
 * <title>/<desc>), mirroring cadence-trends' a11y.ts. Month names are
 * hardcoded so the text (and its tests) never depend on the runtime locale.
 */
export interface ChartA11y {
  title: string;
  desc: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function shortDate(iso: string): string {
  // UTC getters: week keys are date-only ISO strings, which parse as UTC
  // midnight; local getters would shift the narrated day by timezone.
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Weekly volume bars with a rolling trend line and warning highlights. */
export function buildLoadA11y(weeks: WeekSummary[]): ChartA11y {
  const title = "Weekly training volume";
  if (weeks.length === 0) return { title, desc: "No runs to display." };

  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  let min = Infinity;
  let max = -Infinity;
  for (const week of weeks) {
    if (week.distanceKm < min) min = week.distanceKm;
    if (week.distanceKm > max) max = week.distanceKm;
  }

  const parts = [
    `${weeks.length} week${weeks.length === 1 ? "" : "s"} of running volume from ${shortDate(first.weekStarting)} to ${shortDate(last.weekStarting)}.`,
    `Weekly distance ranges from ${min} to ${max} km; a line shows the 3-week rolling average.`,
  ];

  const flagged = weeks.filter((week) => week.warning);
  if (flagged.length > 0) {
    const names = flagged
      .map((week) => `week of ${shortDate(week.weekStarting)}`)
      .join(", ");
    parts.push(
      `${flagged.length} week${flagged.length === 1 ? " is" : "s are"} highlighted for injury risk: ${names}.`,
    );
  } else {
    parts.push("No weeks are flagged for injury risk.");
  }

  return { title, desc: parts.join(" ") };
}
