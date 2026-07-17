import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  addons: [
    "@storybook/addon-mcp",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/react-vite",
  stories: [
    {
      titlePrefix: "Activity Chart",
      directory: "../../../packages/activity-chart/src/",
    },
    {
      titlePrefix: "Cadence Trends",
      directory: "../../../packages/cadence-trends/src/",
    },
    {
      titlePrefix: "Route Map",
      directory: "../../../packages/route-map/src/",
    },
    {
      titlePrefix: "Activity Segments",
      directory: "../../../packages/activity-segments/src/",
    },
    {
      titlePrefix: "Training Load",
      directory: "../../../packages/training-load/src/",
    },
    {
      titlePrefix: "Compare Activities",
      directory: "../../../packages/compare-activities/src/",
    },
    {
      titlePrefix: "Activity Zones",
      directory: "../../../packages/activity-zones/src/",
    },
    {
      directory: "../../../packages/design-system/stories/",
    },
    { titlePrefix: "UI", directory: "../../../packages/ui/src/" },
  ],
});
