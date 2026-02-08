import preview from "@strava-mcp/storybook/preview";
import { Legend, LegendItem } from "./Legend";

function LegendDemo() {
  return (
    <Legend>
      <LegendItem color="var(--chart-heartrate)" label="Heart Rate" />
      <LegendItem color="var(--chart-power)" label="Power" />
      <LegendItem color="var(--chart-pace)" label="Pace" hidden />
      <LegendItem color="var(--chart-altitude)" label="Altitude" />
    </Legend>
  );
}

const meta = preview.meta({ component: LegendDemo });

export const Default = meta.story({});

export const Dark = meta.story({
  globals: { backgrounds: { value: "dark" } },
});
