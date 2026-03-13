import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { TrendView } from "./TrendView";

const noop = () => {};

const meta = preview.meta({ component: TrendView });

export const Default = meta.story({
  args: {
    activities: mockRuns,
    onRunClick: noop,
    selectedRunIds: new Set<number>(),
  },
});

export const WithSelectedRuns = meta.story({
  args: {
    activities: mockRuns,
    onRunClick: noop,
    selectedRunIds: new Set([10003, 10013]),
  },
});
