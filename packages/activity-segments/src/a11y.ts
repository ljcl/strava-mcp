/**
 * Screen-reader narration for the segment-effort list (#253).
 *
 * Seven of the eight MCP Apps ship a narration builder; this was the one
 * without. It is also the most information-dense — per-effort heart rate,
 * cadence, power, and grade sit behind collapsibles — and the row's primary
 * visual encoding is a coloured dot, which carries nothing at all to a
 * screen reader.
 *
 * Two things are produced here: a summary of the list as a whole, and a label
 * per row that says in words what the dot says in colour.
 */

import { type Domain, effortSpeed, formatEffortPace } from "./segments";
import { type SegmentEffortRow } from "./types";

/** How a row's speed reads relative to the rest of the activity. */
export type HeatBand = "fastest" | "faster" | "middle" | "slower" | "slowest";

const BAND_WORDS: Record<HeatBand, string> = {
  fastest: "among the fastest",
  faster: "faster than average",
  middle: "around average",
  slower: "slower than average",
  slowest: "among the slowest",
};

/**
 * Which fifth of the heat ramp an effort falls in. The dot is a continuous
 * gradient, but five named bands is what can actually be said out loud —
 * "62% of the way up the ramp" is precise and useless.
 */
export function heatBand(e: SegmentEffortRow, domain: Domain): HeatBand {
  const span = domain.max - domain.min;
  // A single effort, or a set that all took the same speed, has no spread to
  // rank within: everything is "around average" rather than "the fastest".
  if (!(span > 0)) return "middle";
  const t = (effortSpeed(e) - domain.min) / span;
  if (t >= 0.8) return "fastest";
  if (t >= 0.6) return "faster";
  if (t >= 0.4) return "middle";
  if (t >= 0.2) return "slower";
  return "slowest";
}

/** `mm:ss` for a row's elapsed time. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Accessible name for one row's expand trigger. The visible row is a heat
 * dot, a name, a time, and a badge; the dot and the badge colour are the two
 * parts that do not survive to a screen reader, so both are spelled out.
 */
export function buildRowLabel(
  e: SegmentEffortRow,
  domain: Domain,
  activityType: string | null,
): string {
  const parts = [e.name, clock(e.elapsedTime)];

  const pace = formatEffortPace(e, activityType);
  if (pace !== "—") parts.push(pace);

  if (e.prRank != null) {
    parts.push(e.prRank === 1 ? "personal best" : `personal best ${e.prRank}`);
  } else if (e.komRank != null) {
    parts.push(`top ${e.komRank} all time`);
  }

  parts.push(BAND_WORDS[heatBand(e, domain)]);
  return `${parts.join(", ")}.`;
}

/**
 * One line describing the list as a whole, rendered visually hidden under the
 * card header. Says what the colour encoding means, because a legend a
 * screen-reader user cannot see is not a legend to them.
 */
export function buildSegmentsA11ySummary(
  efforts: SegmentEffortRow[],
  domain: Domain,
  activityType: string | null,
): string {
  if (efforts.length === 0) return "No segments in this activity.";

  const prs = efforts.filter((e) => e.prRank != null).length;
  const top10 = efforts.filter((e) => e.komRank != null).length;

  const parts = [
    `${efforts.length} segment${efforts.length === 1 ? "" : "s"} in this activity`,
  ];
  if (prs > 0) parts.push(`${prs} personal best${prs === 1 ? "" : "s"}`);
  if (top10 > 0) parts.push(`${top10} in the all-time top 10`);

  const sentences = [`${parts.join(", ")}.`];

  const ranked = [...efforts].sort((a, b) => effortSpeed(b) - effortSpeed(a));
  const fastest = ranked[0];
  const slowest = ranked[ranked.length - 1];
  if (fastest && slowest && fastest !== slowest) {
    sentences.push(
      `Fastest was ${fastest.name} at ${formatEffortPace(fastest, activityType)}; slowest was ${slowest.name} at ${formatEffortPace(slowest, activityType)}.`,
    );
  }

  // The dot is the app's primary encoding and is otherwise silent.
  if (domain.max > domain.min) {
    sentences.push(
      "Each segment is marked with a colour showing how its pace compares with the rest of the activity; each row states this in words.",
    );
  }

  return sentences.join(" ");
}
