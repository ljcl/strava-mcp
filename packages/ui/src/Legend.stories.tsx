import preview from "@strava-mcp/design-system/preview";
import { type ReactNode } from "react";
import { Legend, LegendItem } from "./Legend";

const meta = preview.meta({ component: Legend });

export const Default = meta.story({
  render: () => (
    <Legend>
      <LegendItem color="var(--chart-heartrate)" label="Heart Rate" />
      <LegendItem color="var(--chart-power)" label="Power" />
      <LegendItem color="var(--chart-pace)" label="Pace" hidden />
      <LegendItem color="var(--chart-altitude)" label="Altitude" />
    </Legend>
  ),
});

export const Faded = meta.story({
  render: () => (
    <Legend>
      <LegendItem color="var(--chart-heartrate)" label="Heart Rate" />
      <LegendItem color="var(--chart-power)" label="Power" faded />
      <LegendItem color="var(--chart-pace)" label="Pace" faded />
      <LegendItem color="var(--chart-altitude)" label="Altitude" />
    </Legend>
  ),
});

export const Touch = meta.story({
  render: () => (
    <Legend size="touch">
      <LegendItem color="var(--chart-heartrate)" label="Heart Rate" />
      <LegendItem color="var(--chart-power)" label="Power" />
      <LegendItem color="var(--chart-pace)" label="Pace" hidden />
      <LegendItem color="var(--chart-altitude)" label="Altitude" />
    </Legend>
  ),
});

function MobileCardShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: 3,
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "16px 14px",
      }}
    >
      {children}
    </div>
  );
}

export const Mobile = meta.story({
  render: () => (
    <Legend size="touch">
      <LegendItem color="var(--chart-heartrate)" label="Heart Rate" />
      <LegendItem color="var(--chart-power)" label="Power" />
      <LegendItem color="var(--chart-pace)" label="Pace" faded />
      <LegendItem color="var(--chart-altitude)" label="Altitude" hidden />
    </Legend>
  ),
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});
