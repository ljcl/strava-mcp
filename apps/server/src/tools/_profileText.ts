/**
 * Text rendering shared by `get-segment-profile` and `get-route-preview`.
 * Both tools print the same profile from `gradientProfile.ts`, so the prose
 * lives here once — the same reason `formatters.ts` is the server's single
 * formatter home.
 */

import { type GradientProfile, type ProfileShape } from "../gradientProfile";

/** What the course is called in the shape sentence. */
export type ProfileSubject = "segment" | "route";

const SHAPE_SENTENCES: Record<
  ProfileShape,
  (subject: ProfileSubject) => string
> = {
  flat: (s) => `Effectively flat — this ${s} has no meaningful relief.`,
  steady: (s) =>
    `Steady: the gain is spread evenly along the ${s}, so the average grade is a fair guide to how it feels.`,
  "front-loaded": (s) =>
    `Front-loaded: most of the climbing is in the first third of the ${s}, so the average grade overstates the back half.`,
  "back-loaded": (s) =>
    `Back-loaded: most of the climbing is in the last third of the ${s} — the average grade understates the finish.`,
  rolling: (s) =>
    `Rolling: real climbing and descending both, so the ${s}'s average grade is netting them out rather than describing a slope.`,
  descending: (s) => `Net descent over the ${s}.`,
};

/** The headline sentence: what shape this course is, and what that implies. */
export function describeProfile(
  profile: GradientProfile,
  subject: ProfileSubject,
): string {
  const shape = SHAPE_SENTENCES[profile.shape](subject);
  const crux = profile.steepest;
  if (!crux || profile.shape === "flat") return shape;
  const pct = Math.round(crux.positionFraction * 100);
  return `${shape} Steepest ${crux.lengthM} m averages ${crux.gradePct}%, ${pct}% of the way in (${formatMark(crux.startM)}–${formatMark(crux.endM)}).`;
}

/** Distance marks read in metres on a segment and kilometres on a route. */
function formatMark(metres: number): string {
  return metres >= 2000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.round(metres)} m`;
}

/** A tiny fixed-width bar so a band's grade is scannable down the column. */
function gradeBar(gradePct: number): string {
  const steps = Math.min(8, Math.round(Math.abs(gradePct) / 2));
  if (steps === 0) return "·";
  return (gradePct >= 0 ? "▲" : "▼").repeat(steps);
}

/** The climbs list and the per-band breakdown, in that order. */
export function profileTextLines(profile: GradientProfile): string[] {
  const lines: string[] = [];

  if (profile.climbs.length > 0) {
    lines.push(
      `Sustained climbs (${profile.climbs.length}):`,
      ...profile.climbs.map(
        (c) =>
          `  ${formatMark(c.startM)}–${formatMark(c.endM)}: ${c.lengthM} m at ${c.gradePct}% (+${c.elevationChangeM} m)`,
      ),
      "",
    );
  }

  lines.push(`Gradient every ${profile.bandLengthM} m:`);
  for (const b of profile.bands) {
    const change = `${b.elevationChangeM >= 0 ? "+" : ""}${b.elevationChangeM}`;
    lines.push(
      `  ${formatMark(b.startM).padStart(8)}–${formatMark(b.endM).padEnd(8)} ${`${b.gradePct}%`.padStart(6)}  ${change.padStart(6)} m  ${gradeBar(b.gradePct)}`,
    );
  }

  if (profile.warnings.length > 0) {
    lines.push("");
    for (const warning of profile.warnings) lines.push(`Warning: ${warning}`);
  }
  return lines;
}
