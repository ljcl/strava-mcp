import { type ReactNode } from "react";
import styles from "./CardHeader.module.css";

/** Heading level the card title renders as. */
export type HeadingLevel = 2 | 3 | 4;

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Compact (mobile) type scale and padding. */
  compact?: boolean;
  /**
   * Heading level for the title (#257). Defaults to `h2` rather than `h1`
   * because an MCP App card is embedded in the host's own chrome, which owns
   * the page's h1 — an app claiming it would put two h1s in the transcript.
   */
  level?: HeadingLevel;
}

/**
 * Card title + subtitle header shared by the MCP Apps (#170), replacing the
 * byte-identical header blocks each app's module CSS re-declared.
 *
 * The title is a real heading element: before #257 no MCP App exposed one at
 * all, so a screen-reader user got no heading list and no way to jump to the
 * card's content. The class names are unchanged, so the CSS is untouched and
 * the visual result is identical.
 */
export function CardHeader({
  title,
  subtitle,
  compact,
  level = 2,
}: CardHeaderProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={styles.header} data-compact={compact || undefined}>
      <Heading className={styles.title}>{title}</Heading>
      {subtitle != null && <div className={styles.subtitle}>{subtitle}</div>}
    </div>
  );
}
