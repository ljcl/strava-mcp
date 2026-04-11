import preview from "@strava-mcp/storybook/preview";
import { mockRuns } from "./__fixtures__/runs";
import { MobileCardShell } from "./_storyHelpers";
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
