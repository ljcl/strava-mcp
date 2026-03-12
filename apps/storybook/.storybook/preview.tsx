import { definePreview } from "@storybook/react-vite";
import { HOST_THEMES } from "@strava-mcp/design-system/host-themes";
import "@strava-mcp/design-system/tokens.css";

export default definePreview({
  addons: [],
  initialGlobals: {
    backgrounds: { value: "light" },
    hostTheme: { value: "none" },
  },
  decorators: [
    (StoryFn, context) => {
      const isDark = context.globals?.backgrounds?.value === "dark";
      const dataTheme = isDark ? "dark" : "light";
      const hostKey = (context.globals?.hostTheme?.value as string) ?? "none";
      const theme = HOST_THEMES[hostKey] ?? null;
      const vars = theme ? (isDark ? theme.dark : theme.light) : {};

      return (
        <div data-theme={dataTheme} style={vars as React.CSSProperties}>
          <StoryFn />
        </div>
      );
    },
  ],
});
