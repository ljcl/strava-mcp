import preview from "@strava-mcp/storybook/preview";
import { mockStreamCache } from "./__fixtures__/overlay-streams";
import { MobileCardShell } from "./_storyHelpers";
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
