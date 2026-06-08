import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./Legend.module.css";

interface LegendProps {
  children: ReactNode;
  /** "touch" bumps item vertical padding so tap targets meet mobile guidelines */
  size?: "default" | "touch";
}

export function Legend({ children, size = "default" }: LegendProps) {
  // Base UI's ToggleGroup provides roving tabindex + arrow-key navigation and
  // `role="group"`. A series toggle is "pressed" when it is visible (the
  // inverse of `hidden`), matching the previous aria-pressed={!hidden}. We
  // build the controlled value array from the children and inject a stable
  // index value into each LegendItem. The public API stays unchanged.
  const items = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<LegendItemProps>[];
  const value = items.flatMap((item, i) =>
    item.props.hidden ? [] : [String(i)],
  );
  return (
    <ToggleGroup
      value={value}
      multiple
      className={styles.legend}
      data-size={size}
    >
      {items.map((item, i) => cloneElement(item, { value: String(i) }))}
    </ToggleGroup>
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
  /** Injected by Legend to identify the toggle within the group. */
  value?: string;
}

export function LegendItem({
  color,
  label,
  hidden,
  faded,
  onClick,
  onMouseEnter,
  onMouseLeave,
  value,
}: LegendItemProps) {
  return (
    <Toggle
      value={value}
      pressed={!hidden}
      onPressedChange={() => onClick?.()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={styles.legendButton}
      data-hidden={hidden || undefined}
      data-faded={faded || undefined}
      aria-label={`Toggle ${label}`}
    >
      <div
        className={styles.swatch}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Toggle>
  );
}
