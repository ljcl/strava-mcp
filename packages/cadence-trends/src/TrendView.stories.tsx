import preview from "@strava-mcp/design-system/preview";
import { mockRuns } from "./__fixtures__/runs";
import { MobileCardShell } from "./_storyHelpers";
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
