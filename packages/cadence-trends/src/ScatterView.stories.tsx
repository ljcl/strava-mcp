import preview from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
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

export const Mobile = meta.story({
  args: {
    activities: mockRuns,
    onRunClick: noop,
    selectedRunIds: new Set<number>(),
    mode: "mobile",
  },
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
