import preview from "@strava-mcp/design-system/preview";
import {
  annotatedActivity,
  loopActivity,
  noGeometryActivity,
  pointToPointRoute,
  streamLoopActivity,
} from "./__fixtures__/routes";
import { MobileCardShell } from "./_storyHelpers";
import { RouteMap } from "./RouteMap";

const meta = preview.meta({ component: RouteMap });

export const ActivityLoop = meta.story({
  args: { data: loopActivity },
});

export const MetricColoredTrack = meta.story({
  args: { data: streamLoopActivity },
});

export const DarkMetricColoredTrack = meta.story({
  globals: { backgrounds: { value: "dark" } },
  args: { data: streamLoopActivity },
  decorators: [
    (StoryFn) => (
      <div data-theme="dark">
        <StoryFn />
      </div>
    ),
  ],
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

export const AnnotatedTrack = meta.story({
  args: { data: annotatedActivity },
});

/* The basemap stories fetch live OpenFreeMap tiles, so Chromatic must not
 * snapshot them — tile rendering would diff on every run. */
export const Basemap = meta.story({
  args: { data: streamLoopActivity, defaultBasemap: true },
  parameters: { chromatic: { disableSnapshot: true } },
});

export const MobileBasemap = meta.story({
  args: { data: streamLoopActivity, mode: "mobile", defaultBasemap: true },
  globals: { viewport: { value: "claudeIosCard" } },
  parameters: { layout: "fullscreen", chromatic: { disableSnapshot: true } },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});

export const MobileAnnotatedTrack = meta.story({
  args: { data: annotatedActivity, mode: "mobile" },
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

export const MobileMetricColoredTrack = meta.story({
  args: { data: streamLoopActivity, mode: "mobile" },
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
