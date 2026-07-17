/**
 * Lap/segment band labels sit at each band's top-left (`insideTopLeft`). The
 * bands are contiguous, so consecutive labels are only ever separated by a
 * band's width — when several narrow bands run together their labels stack on
 * top of each other into an unreadable smear (worse the more the user zooms
 * the brush into a short window). `selectLapLabels` decides which labels to
 * draw by walking the bands left-to-right and dropping any whose text would
 * collide with the previously drawn label.
 */

export interface LapLabelBand {
  name: string;
  /** Band start in axis units (time seconds, or distance metres for swims). */
  start: number;
  /** Band end in axis units. */
  end: number;
}

/** Approx glyph advance of the 10px reference-area label font. */
const CHAR_WIDTH_PX = 6;
/** Breathing room required between one label's end and the next's start. */
const LABEL_GAP_PX = 6;

/**
 * Return, aligned to `bands`, whether each band's label should render.
 *
 * `axisMin`/`axisMax` are the currently visible axis window (the full range,
 * or the brush-zoomed slice) so labels are chosen against what's actually on
 * screen; `plotWidthPx` is the rendered plot width used to turn label text
 * length into a horizontal footprint. A label is drawn at its band's left
 * edge (clamped into the window) only when its text clears the previously
 * drawn label — so the first of a dense run wins and the rest drop out rather
 * than overlapping.
 */
export function selectLapLabels(
  bands: LapLabelBand[],
  axisMin: number,
  axisMax: number,
  plotWidthPx: number,
): boolean[] {
  const flags = bands.map(() => false);
  const range = axisMax - axisMin;
  if (range <= 0 || plotWidthPx <= 0) return flags;
  const pxPerAxis = plotWidthPx / range;

  // Process in on-screen order regardless of input order.
  const order = bands
    .map((_, i) => i)
    .sort((a, b) => bands[a]!.start - bands[b]!.start);

  let lastLabelEndPx = Number.NEGATIVE_INFINITY;
  for (const i of order) {
    const band = bands[i]!;
    if (!band.name) continue;
    // Band entirely outside the visible window — its label never renders.
    if (band.end <= axisMin || band.start >= axisMax) continue;
    const anchorPx = (Math.max(band.start, axisMin) - axisMin) * pxPerAxis;
    if (anchorPx < lastLabelEndPx + LABEL_GAP_PX) continue; // would overlap
    lastLabelEndPx = anchorPx + band.name.length * CHAR_WIDTH_PX;
    flags[i] = true;
  }
  return flags;
}
