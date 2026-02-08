import preview from "@strava-mcp/storybook/preview";
import { poolSwim } from "./__fixtures__/pool-swim";
import { tempoRun } from "./__fixtures__/tempo-run";
import { ActivityChart } from "./ActivityChart";
import { extractMeta, toChartData, toLapData } from "./normalize";

const meta = preview.meta({ component: ActivityChart });

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
