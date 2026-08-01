import styles from "./RampLegend.module.css";

export interface RampLegendProps {
  /** CSS gradient for the bar, e.g. `RAMP_GRADIENT_CSS` from `@strava-mcp/data`. */
  gradient: string;
  /** Label for the low end of the scale. */
  minLabel: string;
  /** Label for the high end. */
  maxLabel: string;
  /**
   * What the colour encodes, for screen readers ("pace"). The bar itself is
   * decorative; without this the endpoints are two numbers with no subject.
   */
  label: string;
}

/**
 * Key for a continuous colour ramp: a gradient bar between its two endpoint
 * values (#254).
 *
 * Extracted from route-map's metric scale when activity-segments needed the
 * same thing — it colours every row's dot with the identical shared ramp and
 * rendered no key at all, so the app's primary visual encoding could not be
 * interpreted: nothing said whether green meant fast or slow.
 *
 * The gradient arrives as a prop rather than imported, so this stays a purely
 * presentational component and `packages/ui` needs no data dependency.
 */
export function RampLegend({
  gradient,
  minLabel,
  maxLabel,
  label,
}: RampLegendProps) {
  return (
    // A labelled group rather than a hidden sentence: the two endpoint labels
    // are already readable, so restating them would have a screen reader say
    // every value twice. What is missing is only the subject — what the
    // colour encodes — which is exactly what the group label supplies.
    <div
      className={styles.scale}
      role="group"
      aria-label={`Colour scale: ${label}`}
    >
      <span className={styles.scaleLabel}>{minLabel}</span>
      <span
        className={styles.scaleBar}
        style={{ background: gradient }}
        aria-hidden="true"
      />
      <span className={styles.scaleLabel}>{maxLabel}</span>
    </div>
  );
}
