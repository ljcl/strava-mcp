import preview from "@strava-mcp/design-system/preview";
import { type ReactNode } from "react";
import { poolSwim } from "./__fixtures__/pool-swim";
import { tempoRun } from "./__fixtures__/tempo-run";
import { ActivityChart } from "./ActivityChart";
import { extractMeta, toChartData, toLapData } from "./normalize";

const meta = preview.meta({ component: ActivityChart });

/**
 * Renders the story inside the same bordered card shell that main.tsx
 * uses in the MCP app so mobile previews reflect what ships to hosts.
 */
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

const mobileLayout = {
  mode: "mobile" as const,
  width: 360,
  height: null,
  isTouch: true,
  chartAspect: 0.95,
  chartHeight: 260,
};

export const TempoRun = meta.story({
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
});

export const PoolSwim = meta.story({
  args: {
    data: toChartData(poolSwim),
    meta: extractMeta(poolSwim),
    laps: toLapData(poolSwim),
  },
});

export const DarkTempoRun = meta.story({
  globals: {
    backgrounds: { value: "dark" },
  },
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
  decorators: [
    (StoryFn) => (
      <div data-theme="dark">
        <StoryFn />
      </div>
    ),
  ],
});

export const CyclingRide = meta.story({
  args: {
    data: toChartData(tempoRun),
    meta: {
      ...extractMeta(tempoRun),
      activityType: "Ride",
      isRunning: false,
      isSwimming: false,
    },
    laps: toLapData(tempoRun),
  },
});

export const DarkPoolSwim = meta.story({
  globals: {
    backgrounds: { value: "dark" },
  },
  args: {
    data: toChartData(poolSwim),
    meta: extractMeta(poolSwim),
    laps: toLapData(poolSwim),
  },
});

export const MobileRun = meta.story({
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
    layout: mobileLayout,
    mode: "mobile",
  },
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  // layout: fullscreen removes Storybook's outer padding so the preview
  // matches what actually ships: the card sits directly against the
  // iframe edge, with only our 3px outer margin.
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});

export const MobileSwim = meta.story({
  args: {
    data: toChartData(poolSwim),
    meta: extractMeta(poolSwim),
    laps: toLapData(poolSwim),
    layout: mobileLayout,
    mode: "mobile",
  },
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
