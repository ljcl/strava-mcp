import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** Variant changes the shape */
  variant?: "chart" | "bar" | "pills";
}

export function Skeleton({ variant = "chart" }: SkeletonProps) {
  // Decorative: the loading announcement comes from LoadingState (#172).
  return (
    <div className={styles.skeleton} data-variant={variant} aria-hidden="true">
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
