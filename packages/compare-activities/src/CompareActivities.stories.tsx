import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import {
  baselineRun,
  compareData,
  hrOnlyPair,
  raceRun,
} from "./__fixtures__/runs";
import { CompareActivities } from "./CompareActivities";

const meta = preview.meta({ component: CompareActivities });

const mobileLayout = {
  mode: "mobile" as const,
  width: 360,
  height: null,
  isTouch: true,
  chartAspect: 1.1,
  chartHeight: 260,
};

export const SteadyVsRace = meta.story({
  args: {
    a: baselineRun,
    b: raceRun,
    compare: compareData,
  },
});

export const DarkSteadyVsRace = meta.story({
  globals: darkGlobals,
  args: {
    a: baselineRun,
    b: raceRun,
    compare: compareData,
  },
});

/** The overlay still renders when the aggregate summary fetch fails. */
export const WithoutSummary = meta.story({
  args: {
    a: baselineRun,
    b: raceRun,
    compare: null,
  },
});

/** Treadmill pair: heart rate only, time axis, no axis/metric toggles. */
export const HeartRateOnly = meta.story({
  args: {
    a: hrOnlyPair[0],
    b: hrOnlyPair[1],
    compare: null,
  },
});

export const MobileCompare = meta.story({
  args: {
    a: baselineRun,
    b: raceRun,
    compare: compareData,
    layout: mobileLayout,
    mode: "mobile",
  },
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  // layout: fullscreen removes Storybook's outer padding so the preview
  // matches what actually ships: the card sits directly against the
  // iframe edge, with only our 3px outer margin.
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});
