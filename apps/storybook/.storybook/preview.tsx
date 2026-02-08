import { definePreview } from "@storybook/react-vite";
import "@strava-mcp/design-system/tokens.css";

export default definePreview({
  addons: [],
  initialGlobals: {
    backgrounds: { value: "light" },
  },
  decorators: [
    (StoryFn, context) => {
      const dataTheme =
        context.globals?.backgrounds?.value === "dark" ? "dark" : "light";

      return (
        <div data-theme={dataTheme}>
          <StoryFn />
        </div>
      );
    },
  ],
});
