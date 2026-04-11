import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { MobileCardShell } from "./_storyHelpers";
import { ZonesView } from "./ZonesView";

const meta = preview.meta({ component: ZonesView });

export const Default = meta.story({
  args: { activities: mockRuns },
});

export const Mobile = meta.story({
  args: { activities: mockRuns, mode: "mobile" },
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <div style={{ height: 260 }}>
          <StoryFn />
        </div>
      </MobileCardShell>
    ),
  ],
});
