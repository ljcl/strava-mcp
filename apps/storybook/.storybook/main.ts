import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  framework: "@storybook/react-vite",
  stories: [
    "../../../packages/activity-chart/src/**/*.stories.@(ts|tsx)",
    "../../../packages/design-system/stories/**/*.stories.@(ts|tsx)",
    "../../../packages/ui/src/**/*.stories.@(ts|tsx)",
  ],
});
