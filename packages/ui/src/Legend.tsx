import { type ReactNode } from "react";
import styles from "./Legend.module.css";

interface LegendProps {
  children: ReactNode;
  /** "touch" bumps item vertical padding so tap targets meet mobile guidelines */
  size?: "default" | "touch";
}

export function Legend({ children, size = "default" }: LegendProps) {
  return (
    <div className={styles.legend} data-size={size}>
      {children}
    </div>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  hidden?: boolean;
  faded?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LegendItem({
  color,
  label,
  hidden,
  faded,
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
      data-faded={faded || undefined}
      aria-pressed={!hidden}
      aria-label={`Toggle ${label}`}
    >
      <div
        className={styles.swatch}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </button>
  );
}
