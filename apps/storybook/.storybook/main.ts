import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  addons: ["@storybook/addon-mcp"],
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
      directory: "../../../packages/design-system/stories/",
    },
    { titlePrefix: "UI", directory: "../../../packages/ui/src/" },
  ],
});
