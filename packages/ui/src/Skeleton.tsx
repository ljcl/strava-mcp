import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** Variant changes the shape */
  variant?: "chart" | "bar" | "pills";
}

export function Skeleton({ variant = "chart" }: SkeletonProps) {
  return (
    <div className={styles.skeleton} data-variant={variant}>
      {variant === "chart" && (
        <>
          <div className={styles.chartArea} />
          <div className={styles.chartFooter}>
            <div className={styles.pillRow}>
              <div className={styles.pillGhost} />
              <div className={styles.pillGhost} />
              <div className={styles.pillGhost} />
            </div>
          </div>
        </>
      )}
      {variant === "bar" && (
        <div className={styles.barRow}>
          <div className={styles.barItem} />
          <div className={styles.barItem} />
          <div className={styles.barItem} />
        </div>
      )}
      {variant === "pills" && (
        <div className={styles.pillRow}>
          <div className={styles.pillGhost} />
          <div className={styles.pillGhost} />
          <div className={styles.pillGhost} />
          <div className={styles.pillGhost} />
        </div>
      )}
    </div>
  );
}
