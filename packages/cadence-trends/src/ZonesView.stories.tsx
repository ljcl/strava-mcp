import preview from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { mockRuns } from "./__fixtures__/runs";
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
