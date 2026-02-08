import { type ReactNode } from "react";
import styles from "./Legend.module.css";

interface LegendProps {
  children: ReactNode;
}

export function Legend({ children }: LegendProps) {
  return <div className={styles.legend}>{children}</div>;
}

interface LegendItemProps {
  color: string;
  label: string;
  hidden?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LegendItem({
  color,
  label,
  hidden,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: LegendItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={styles.legendButton}
      data-hidden={hidden || undefined}
    >
      <div className={styles.swatch} style={{ backgroundColor: color }} />
      <span>{label}</span>
    </button>
  );
}
