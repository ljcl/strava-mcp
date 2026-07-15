import { type ReactNode } from "react";
import styles from "./CardHeader.module.css";

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Compact (mobile) type scale and padding. */
  compact?: boolean;
}

/**
 * Card title + subtitle header shared by the MCP Apps (#170), replacing the
 * byte-identical header blocks each app's module CSS re-declared.
 */
export function CardHeader({ title, subtitle, compact }: CardHeaderProps) {
  return (
    <div className={styles.header} data-compact={compact || undefined}>
      <div className={styles.title}>{title}</div>
      {subtitle != null && <div className={styles.subtitle}>{subtitle}</div>}
    </div>
  );
}
