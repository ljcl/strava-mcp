import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { ScatterView } from "./ScatterView";

const noop = () => {};

const meta = preview.meta({ component: ScatterView });

export const Default = meta.story({
  args: {
    activities: mockRuns,
    onRunClick: noop,
    selectedRunIds: new Set<number>(),
  },
});
