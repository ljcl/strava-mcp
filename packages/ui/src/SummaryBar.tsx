import styles from "./SummaryBar.module.css";

export interface SummaryStat {
  label: string;
  /** Preformatted display value (units included), e.g. "174 spm". */
  value: string;
  /**
   * Marks the stat as a trend: "up" renders in the success color, "down" in
   * the danger color, "flat" in the tertiary text color.
   */
  direction?: "up" | "down" | "flat";
}

export interface SummaryBarProps {
  stats: SummaryStat[];
  /** Tightens spacing and padding for mobile */
  compact?: boolean;
}

/**
 * Header stat strip shared by the MCP Apps: a row of label-over-value stats
 * with an optional trend-colored entry, separated from the content below by
 * a hairline border.
 */
export function SummaryBar({ stats, compact }: SummaryBarProps) {
  return (
    <div className={styles.bar} data-compact={compact || undefined}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.stat}>
          <span className={styles.label}>{stat.label}</span>
          <span
            className={stat.direction ? styles.delta : styles.value}
            data-direction={stat.direction}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
