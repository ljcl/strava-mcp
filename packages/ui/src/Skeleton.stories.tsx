import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { Skeleton } from "./Skeleton";

const meta = preview.meta({
  component: Skeleton,
  // ui primitives are the first package gated on axe (#165).
  parameters: { a11y: { test: "error" } },
});

export const Chart = meta.story({
  args: { variant: "chart" },
});

export const DarkChart = meta.story({
  globals: darkGlobals,
  args: { variant: "chart" },
});

export const Bar = meta.story({
  args: { variant: "bar" },
});

export const Pills = meta.story({
  args: { variant: "pills" },
});
