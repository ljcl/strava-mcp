import preview from "@strava-mcp/design-system/preview";
import {
  defaultActivity,
  noHighlights,
  noSegments,
} from "./__fixtures__/segments";
import { MobileCardShell } from "./_storyHelpers";
import { ActivitySegments } from "./ActivitySegments";

const meta = preview.meta({ component: ActivitySegments });

export const Default = meta.story({
  args: { data: defaultActivity, mode: "desktop" },
});

export const Dark = meta.story({
  globals: { backgrounds: { value: "dark" } },
  args: { data: defaultActivity, mode: "desktop" },
  decorators: [
    (StoryFn) => (
      <div data-theme="dark">
        <StoryFn />
      </div>
    ),
  ],
});

export const NoHighlights = meta.story({
  args: { data: noHighlights, mode: "desktop" },
});

export const NoSegments = meta.story({
  args: { data: noSegments, mode: "desktop" },
});

export const Mobile = meta.story({
  args: { data: defaultActivity, mode: "mobile" },
  globals: { viewport: { value: "claudeIosCard" } },
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});
