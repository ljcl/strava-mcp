import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  currentAvg: number;
  delta: number;
  runCount: number;
  weeks: number;
}

export function SummaryBar({ currentAvg, delta, runCount, weeks }: SummaryBarProps) {
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";

  return (
    <div className={styles.bar}>
      <div className={styles.stat}>
        <span className={styles.label}>Avg Cadence</span>
        <span className={styles.value}>
          {currentAvg > 0 ? `${currentAvg} spm` : "\u2014"}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Trend</span>
        <span className={styles.delta} data-direction={direction}>
          {delta !== 0 ? `${sign}${delta} spm` : "flat"}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Runs</span>
        <span className={styles.value}>
          {runCount} in {weeks}w
        </span>
      </div>
    </div>
  );
}
