import { type ReactNode } from "react";
import styles from "./LoadingState.module.css";

export interface LoadingStateProps {
  /** Screen-reader announcement for the status region. */
  label?: string;
  /**
   * Live progress line from the server, rendered above the placeholder
   * (#279). Omit it and the skeletons look exactly as they did.
   */
  progress?: string | null;
  /** Decorative loading placeholder, usually one or more Skeletons. */
  children?: ReactNode;
}

/**
 * Status region for the MCP App loading branches (#172): announces the
 * visually-hidden label politely when a fetch starts (WCAG 4.1.3 status
 * messages), and unmounting it when content arrives ends the status. The
 * skeletons inside stay decorative — `Skeleton` is `aria-hidden` itself.
 *
 * A `progress` message sits inside the same status region rather than beside
 * it, so each update is announced as it arrives instead of only the opening
 * label — which is the point of reporting progress at all.
 */
export function LoadingState({
  label = "Loading",
  progress,
  children,
}: LoadingStateProps) {
  return (
    <div role="status">
      <span className={styles.srOnly}>{label}</span>
      {progress ? <p className={styles.progress}>{progress}</p> : null}
      {children}
    </div>
  );
}
