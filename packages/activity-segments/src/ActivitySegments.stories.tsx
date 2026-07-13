import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import {
  defaultActivity,
  noHighlights,
  noSegments,
} from "./__fixtures__/segments";
import { ActivitySegments } from "./ActivitySegments";

const meta = preview.meta({ component: ActivitySegments });

export const Default = meta.story({
  args: { data: defaultActivity, mode: "desktop" },
});

export const Dark = meta.story({
  globals: darkGlobals,
  args: { data: defaultActivity, mode: "desktop" },
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
