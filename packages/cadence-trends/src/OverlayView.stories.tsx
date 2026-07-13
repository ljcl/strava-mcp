import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { mockStreamCache } from "./__fixtures__/overlay-streams";
import { OverlayView } from "./OverlayView";

const noop = () => {};

const meta = preview.meta({ component: OverlayView });

export const EmptyState = meta.story({
  args: {
    selectedRunIds: new Set<number>(),
    streamCache: new Map(),
    loadingStreams: new Set<number>(),
    fetchStreamForRun: noop,
  },
});

export const WithData = meta.story({
  args: {
    selectedRunIds: new Set([10003, 10013]),
    streamCache: mockStreamCache,
    loadingStreams: new Set<number>(),
    fetchStreamForRun: noop,
  },
});

/**
 * Dark host theme (#117): the overlay tooltip must render via the shared
 * themed Tooltip, not Recharts' default white box. Hover a line to verify.
 */
export const WithDataDark = meta.story({
  args: {
    selectedRunIds: new Set([10003, 10013]),
    streamCache: mockStreamCache,
    loadingStreams: new Set<number>(),
    fetchStreamForRun: noop,
  },
  globals: {
    ...darkGlobals,
    hostTheme: "claude",
  },
});

export const Loading = meta.story({
  args: {
    selectedRunIds: new Set([10003, 10013]),
    streamCache: new Map([...mockStreamCache].slice(0, 1)),
    loadingStreams: new Set([10013]),
    fetchStreamForRun: noop,
  },
});

export const Mobile = meta.story({
  args: {
    selectedRunIds: new Set([10003, 10013]),
    streamCache: mockStreamCache,
    loadingStreams: new Set<number>(),
    fetchStreamForRun: noop,
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
