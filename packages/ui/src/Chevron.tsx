import { type ReactNode } from "react";
import styles from "./Chevron.module.css";

/**
 * Disclosure chevron for Base UI `Collapsible` trigger rows. Points right
 * closed, rotates to point down when the trigger's `data-panel-open` is set.
 */
export function Chevron(): ReactNode {
  return (
    <svg
      className={styles.chevron}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
