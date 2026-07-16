import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { LoadingState } from "./LoadingState";
import { Skeleton } from "./Skeleton";

const meta = preview.meta({ component: LoadingState });

export const Default = meta.story({
  render: () => (
    <LoadingState label="Loading activity chart">
      <Skeleton variant="chart" />
    </LoadingState>
  ),
});

export const Dark = meta.story({
  globals: darkGlobals,
  render: () => (
    <LoadingState label="Loading activity chart">
      <Skeleton variant="chart" />
    </LoadingState>
  ),
});
