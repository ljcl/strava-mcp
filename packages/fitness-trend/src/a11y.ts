import { formatShortDate } from "@strava-mcp/data";
import { BAND_LABELS, isPlanned, planDays, signedTsb } from "./normalize";
import { type FitnessTrendData } from "./types";

/**
 * Narration spells the year out: "14 Sep 2025". Dates are date-only ISO
 * strings, which parse as UTC midnight; `formatShortDate` reads them in UTC
 * so the narrated day never shifts by the viewer's (or CI's) timezone.
 */
const fullDate = (iso: string) => formatShortDate(iso, "full");

export interface ChartA11y {
  title: string;
  desc: string;
}

/**
 * Screen-reader narration for the fitness-trend chart. Recharts'
 * accessibilityLayer gives keyboard focus and arrow-key tooltip stepping, but
 * the SVG carries no accessible name or summary of its own; this feeds the
 * chart's `title`/`desc` props, per the convention in the sibling apps.
 */
export function buildTrendA11y(data: FitnessTrendData): ChartA11y {
  const title = "Fitness, fatigue, and form";
  const first = data.series[0];
  const last = data.series[data.series.length - 1];
  if (!first || !last) {
    return { title, desc: "No days to display." };
  }

  const parts = [
    `${data.series.length} day${data.series.length === 1 ? "" : "s"} from ${fullDate(first.date)} to ${fullDate(last.date)}.`,
    `Fitness (CTL) ${last.ctl}, fatigue (ATL) ${last.atl}, form (TSB) ${signedTsb(last.tsb)} on ${fullDate(last.date)}.`,
  ];

  const direction =
    data.series.length >= 8
      ? last.ctl - data.series[data.series.length - 8]!.ctl
      : null;
  if (direction !== null) {
    const rounded = Math.round(direction * 10) / 10;
    parts.push(
      rounded > 0
        ? `Fitness rose ${rounded} over the last 7 days.`
        : rounded < 0
          ? `Fitness fell ${Math.abs(rounded)} over the last 7 days.`
          : "Fitness held level over the last 7 days.",
    );
  }

  const plan = planDays(data);
  if (plan.length > 0) {
    const landing = plan[plan.length - 1]!;
    parts.push(
      isPlanned(data)
        ? `A dashed ${plan.length}-day taper plan continues the curves to ${fullDate(landing.date)}, landing on form ${signedTsb(landing.tsb)}.`
        : `A dashed ${plan.length}-day rest projection continues the curves to ${fullDate(landing.date)}, reaching form ${signedTsb(landing.tsb)}.`,
    );
  }

  if (data.bands.length > 0) {
    const described = data.bands
      .map(
        (band) =>
          `${BAND_LABELS[band.kind].toLowerCase()} from ${fullDate(band.startDate)} to ${fullDate(band.endDate)}`,
      )
      .join(", ");
    parts.push(
      `${data.bands.length} shaded period${data.bands.length === 1 ? "" : "s"}: ${described}.`,
    );
  } else {
    parts.push("No periods are shaded for fatigue, freshness, or ramp risk.");
  }

  return { title, desc: parts.join(" ") };
}
