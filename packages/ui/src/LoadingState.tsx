import { type ReactNode } from "react";
import styles from "./LoadingState.module.css";

export interface LoadingStateProps {
  /** Screen-reader announcement for the status region. */
  label?: string;
  /** Decorative loading placeholder, usually one or more Skeletons. */
  children?: ReactNode;
}

/**
 * Status region for the MCP App loading branches (#172): announces the
 * visually-hidden label politely when a fetch starts (WCAG 4.1.3 status
 * messages), and unmounting it when content arrives ends the status. The
 * skeletons inside stay decorative — `Skeleton` is `aria-hidden` itself.
 */
export function LoadingState({
  label = "Loading",
  children,
}: LoadingStateProps) {
  return (
    <div role="status">
      <span className={styles.srOnly}>{label}</span>
      {children}
    </div>
  );
}
