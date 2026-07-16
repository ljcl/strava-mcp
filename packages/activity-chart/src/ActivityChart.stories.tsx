import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { expect, waitFor } from "storybook/test";
import { poolSwim } from "./__fixtures__/pool-swim";
import { tempoRun } from "./__fixtures__/tempo-run";
import { ActivityChart } from "./ActivityChart";
import { extractMeta, toChartData, toLapData } from "./normalize";

const meta = preview.meta({ component: ActivityChart });

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
  globals: darkGlobals,
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
});

/**
 * Interaction test (#164): toggling a legend item hides its series. The SVG
 * <desc> narration is rebuilt from the visible metrics, so it doubles as a
 * semantic assertion that the heart-rate line really left the chart (and
 * Chromatic snapshots the toggled-off state).
 */
export const LegendToggleHidesSeries = meta.story({
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const descText = () =>
      canvasElement.querySelector("desc")?.textContent ?? "";
    // ResponsiveContainer needs a resize tick before the chart mounts.
    await waitFor(() => expect(descText()).toContain("Heart rate ranges"));

    const hrToggle = canvas.getByRole("button", { name: "Toggle Heart Rate" });
    await expect(hrToggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hrToggle);

    await expect(hrToggle).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(descText()).not.toContain("Heart rate ranges"));
    // Pace is untouched by the toggle and stays drawn.
    await expect(descText()).toContain("Pace ranges");
  },
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
  globals: darkGlobals,
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
