/**
 * Shared Recharts numeric tokens. These are JS, not CSS, because Recharts
 * takes numeric props for font sizes, stroke widths, margins, etc.
 *
 * Per-chart layout values (marginLeft, marginRight, marginTop, marginBottom)
 * intentionally stay local to each chart view. They express layout intent
 * that differs between a hero chart (activity-chart pulls in with negative
 * margins) and dense analysis charts (cadence-trends uses positive margins).
 */

export type ChartMode = "mobile" | "desktop";

export function getChartTokens(mode: ChartMode) {
  const isMobile = mode === "mobile";
  return {
    /** Recharts axis tick font size. */
    axisFont: isMobile ? 14 : 13,
    /** Primary series stroke width. */
    strokeWidth: isMobile ? 2.25 : 2,
    /** Lighter secondary-series stroke (e.g. cadence overlay). */
    secondaryStrokeWidth: isMobile ? 1.75 : 1.5,
    /** Scatter/trend dot scaling factor. */
    dotScale: isMobile ? 0.75 : 1,
    /** Bar chart error-bar whisker width. */
    errorBarWidth: isMobile ? 6 : 8,
    /** Label font size for bar chart values. */
    labelFontSize: isMobile ? 9 : 10,
    /** Legend size prop for the shared Legend component. */
    legendSize: (isMobile ? "touch" : "default") as "default" | "touch",
  };
}

/** CartesianGrid strokeDasharray shared by every chart. */
export const GRID_DASHARRAY = "3 3";

/**
 * Width (in px) below which we render the mobile layout. Chosen to cover
 * iPhone Pro Max (~430 CSS px), rotated iPads in split view, and narrow
 * desktop side panels where the desktop layout would wrap and collide.
 *
 * The full detection heuristic lives in `packages/ui/src/useMobileMode.ts`.
 */
export const MOBILE_BREAKPOINT_PX = 640;
