import preview from "@strava-mcp/design-system/preview";
import { Skeleton } from "./Skeleton";

const meta = preview.meta({ component: Skeleton });

export const Chart = meta.story({
  args: { variant: "chart" },
});

export const Bar = meta.story({
  args: { variant: "bar" },
});

export const Pills = meta.story({
  args: { variant: "pills" },
});
