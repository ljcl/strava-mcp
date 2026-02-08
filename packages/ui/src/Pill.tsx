import { type ReactNode } from "react";
import styles from "./Pill.module.css";

interface PillGroupProps {
  children: ReactNode;
}

export function PillGroup({ children }: PillGroupProps) {
  return <div className={styles.pillGroup}>{children}</div>;
}

interface PillProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Pill({ active, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={styles.pill}
      data-active={active || undefined}
    >
      {children}
    </button>
  );
}
