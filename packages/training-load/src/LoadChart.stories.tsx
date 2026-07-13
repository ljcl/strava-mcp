import preview from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { mockWeeks } from "./__fixtures__/weeks";
import { LoadChart } from "./LoadChart";

const meta = preview.meta({ component: LoadChart });

export const Default = meta.story({
  args: { weeks: mockWeeks, showTrend: true, showWarnings: true },
});

export const TrendHidden = meta.story({
  args: { weeks: mockWeeks, showTrend: false, showWarnings: true },
});

export const WarningsHidden = meta.story({
  args: { weeks: mockWeeks, showTrend: true, showWarnings: false },
});

export const Empty = meta.story({
  args: { weeks: [], showTrend: true, showWarnings: true },
});

export const Mobile = meta.story({
  args: {
    weeks: mockWeeks,
    showTrend: true,
    showWarnings: true,
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
