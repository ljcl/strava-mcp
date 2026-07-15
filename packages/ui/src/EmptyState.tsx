import { type ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** The no-data message. */
  children: ReactNode;
}

/**
 * Bordered no-data card shared by the MCP Apps (#170), unifying the three
 * divergent empty-state looks the apps had grown (bordered card, plain
 * centered text, chart-height text block).
 */
export function EmptyState({ children }: EmptyStateProps) {
  return <div className={styles.emptyState}>{children}</div>;
}
