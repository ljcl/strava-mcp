import preview from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "./_storyHelpers";
import { SummaryBar } from "./SummaryBar";

const meta = preview.meta({ component: SummaryBar });

export const Improving = meta.story({
  args: { currentAvg: 174, delta: 3, runCount: 15, weeks: 6 },
});

export const Declining = meta.story({
  args: { currentAvg: 168, delta: -2, runCount: 12, weeks: 6 },
});

export const Flat = meta.story({
  args: { currentAvg: 170, delta: 0, runCount: 10, weeks: 6 },
});

export const Mobile = meta.story({
  args: { currentAvg: 174, delta: 3, runCount: 15, weeks: 6, compact: true },
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});
