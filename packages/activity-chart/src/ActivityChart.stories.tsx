import { type Meta, type StoryObj } from "@storybook/react";
import { poolSwim } from "./__fixtures__/pool-swim";
import { tempoRun } from "./__fixtures__/tempo-run";
import { ActivityChart } from "./ActivityChart";
import { extractMeta, toChartData, toLapData } from "./normalize";

const meta: Meta<typeof ActivityChart> = {
  component: ActivityChart,
};

export default meta;
type Story = StoryObj<typeof ActivityChart>;

export const TempoRun: Story = {
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
};

export const PoolSwim: Story = {
  args: {
    data: toChartData(poolSwim),
    meta: extractMeta(poolSwim),
    laps: toLapData(poolSwim),
  },
};

export const DarkTempoRun: Story = {
  args: {
    data: toChartData(tempoRun),
    meta: extractMeta(tempoRun),
    laps: toLapData(tempoRun),
  },
  decorators: [
    (StoryFn) => (
      <div
        className="dark"
        style={{
          background: "var(--color-background-primary)",
          padding: "24px",
          borderRadius: "var(--border-radius-md)",
        }}
      >
        <StoryFn />
      </div>
    ),
  ],
};

export const CyclingRide: Story = {
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
};

export const DarkPoolSwim: Story = {
  args: {
    data: toChartData(poolSwim),
    meta: extractMeta(poolSwim),
    laps: toLapData(poolSwim),
  },
  decorators: [
    (StoryFn) => (
      <div
        className="dark"
        style={{
          background: "var(--color-background-primary)",
          padding: "24px",
          borderRadius: "var(--border-radius-md)",
        }}
      >
        <StoryFn />
      </div>
    ),
  ],
};
