import preview from "@strava-mcp/design-system/preview";
import {
  loopActivity,
  noGeometryActivity,
  pointToPointRoute,
} from "./__fixtures__/routes";
import { MobileCardShell } from "./_storyHelpers";
import { RouteMap } from "./RouteMap";

const meta = preview.meta({ component: RouteMap });

export const ActivityLoop = meta.story({
  args: { data: loopActivity },
});

export const SavedRoute = meta.story({
  args: { data: pointToPointRoute },
});

export const DarkActivityLoop = meta.story({
  globals: { backgrounds: { value: "dark" } },
  args: { data: loopActivity },
  decorators: [
    (StoryFn) => (
      <div data-theme="dark">
        <StoryFn />
      </div>
    ),
  ],
});

export const NoGeometry = meta.story({
  args: { data: noGeometryActivity },
});

export const MobileActivityLoop = meta.story({
  args: { data: loopActivity, mode: "mobile" },
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

export const MobileSavedRoute = meta.story({
  args: { data: pointToPointRoute, mode: "mobile" },
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
