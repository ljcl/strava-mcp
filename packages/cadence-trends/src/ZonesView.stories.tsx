import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { ZonesView } from "./ZonesView";

const meta = preview.meta({ component: ZonesView });

export const Default = meta.story({
  args: { activities: mockRuns },
});
