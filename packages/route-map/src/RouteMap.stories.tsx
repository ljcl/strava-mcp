import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { expect, waitFor } from "storybook/test";
import {
  annotatedActivity,
  loopActivity,
  noGeometryActivity,
  pointToPointRoute,
  streamLoopActivity,
  waypointedActivity,
  waypointedRoute,
} from "./__fixtures__/routes";
import { RouteMap } from "./RouteMap";

const meta = preview.meta({ component: RouteMap });

/* The basemap is the app's default view, but it renders live OpenFreeMap
 * tiles which Chromatic cannot snapshot deterministically. The grid stories
 * pin `basemapEnabled: false` (exactly the app's tiles-unavailable fallback);
 * the two Basemap stories exercise the real default with snapshots disabled. */

export const ActivityLoop = meta.story({
  args: { data: loopActivity, basemapEnabled: false },
});

export const MetricColoredTrack = meta.story({
  args: { data: streamLoopActivity, basemapEnabled: false },
});

export const DarkMetricColoredTrack = meta.story({
  globals: darkGlobals,
  args: { data: streamLoopActivity, basemapEnabled: false },
});

/**
 * Interaction test (#164): switching the colour metric re-bins the track and
 * reformats the gradient scale legend. The scale's min/max labels use the
 * metric's own unit, so "bpm" appearing there is proof the heart-rate series
 * became active (and Chromatic snapshots the HR-coloured track).
 */
export const SwitchColorMetric = meta.story({
  args: { data: streamLoopActivity, basemapEnabled: false },
  play: async ({ canvas, canvasElement, userEvent }) => {
    // The default active metric for a run is pace; its scale reads "/km".
    const pacePill = await canvas.findByRole("button", { name: "Pace" });
    await expect(pacePill).toHaveAttribute("aria-pressed", "true");

    const hrPill = canvas.getByRole("button", { name: "Heart rate" });
    await userEvent.click(hrPill);

    await expect(hrPill).toHaveAttribute("aria-pressed", "true");
    await expect(pacePill).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      const scaleLabels = [...canvasElement.querySelectorAll("span")]
        .map((el) => el.textContent ?? "")
        .filter((text) => text.includes("bpm"));
      expect(scaleLabels).toHaveLength(2);
    });
  },
});

export const SavedRoute = meta.story({
  args: { data: pointToPointRoute, basemapEnabled: false },
});

export const DarkActivityLoop = meta.story({
  globals: darkGlobals,
  args: { data: loopActivity, basemapEnabled: false },
});

export const NoGeometry = meta.story({
  args: { data: noGeometryActivity, basemapEnabled: false },
});

export const MobileActivityLoop = meta.story({
  args: { data: loopActivity, mode: "mobile", basemapEnabled: false },
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
  args: { data: annotatedActivity, basemapEnabled: false },
});

export const WaypointedTrack = meta.story({
  args: { data: waypointedActivity, basemapEnabled: false },
});

export const WaypointedRoute = meta.story({
  args: { data: waypointedRoute, basemapEnabled: false },
});

/**
 * Interaction test: the footer legend's Waypoints item toggles the marker
 * layer. Each waypoint titles both a track diamond and an elevation-strip
 * diamond, so two matches collapse to zero once hidden.
 */
export const ToggleWaypoints = meta.story({
  args: { data: waypointedActivity, basemapEnabled: false },
  play: async ({ canvas, canvasElement, userEvent }) => {
    // SVG <title> children of the marker paths (getByTitle only matches
    // direct svg > title children, so query them directly).
    const gelMarkers = () =>
      [...canvasElement.querySelectorAll("title")].filter(
        (el) => el.textContent === "Gel 1 · 0.5 km",
      );
    await waitFor(() => expect(gelMarkers()).toHaveLength(2));

    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle Waypoints" }),
    );

    await waitFor(() => expect(gelMarkers()).toHaveLength(0));
  },
});

export const Basemap = meta.story({
  args: { data: annotatedActivity },
  parameters: { chromatic: { disableSnapshot: true } },
});

export const MobileBasemap = meta.story({
  args: { data: annotatedActivity, mode: "mobile" },
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

export const MobileWaypointedTrack = meta.story({
  args: { data: waypointedActivity, mode: "mobile", basemapEnabled: false },
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

export const MobileAnnotatedTrack = meta.story({
  args: { data: annotatedActivity, mode: "mobile", basemapEnabled: false },
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
  args: { data: streamLoopActivity, mode: "mobile", basemapEnabled: false },
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
  args: { data: pointToPointRoute, mode: "mobile", basemapEnabled: false },
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
