import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { ZonesView } from "./ZonesView";

const meta = preview.meta({ component: ZonesView });

export const Light = meta.story({
  args: { activities: mockRuns },
});

export const Dark = meta.story({
  globals: { backgrounds: { value: "dark" } },
  args: { activities: mockRuns },
});
