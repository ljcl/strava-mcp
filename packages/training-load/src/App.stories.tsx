import preview from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { mockTrainingLoadData } from "./__fixtures__/weeks";
import { App } from "./App";

const meta = preview.meta({ component: App });

export const Default = meta.story({
  args: { app: null, data: mockTrainingLoadData },
});

export const Dark = meta.story({
  args: { app: null, data: mockTrainingLoadData },
  globals: {
    backgrounds: { value: "dark" },
  },
});

export const Mobile = meta.story({
  args: { app: null, data: mockTrainingLoadData, mode: "mobile" },
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
