import { definePreview } from "@storybook/react-vite";
import {
  HOST_THEMES,
  type HostThemePreset,
} from "@strava-mcp/design-system/host-themes";
import "@strava-mcp/design-system/tokens.css";

/** Collect every CSS variable key used across all theme presets */
const ALL_HOST_KEYS = new Set(
  Object.values(HOST_THEMES)
    .filter((t): t is HostThemePreset => t !== null)
    .flatMap((t) => [...Object.keys(t.light), ...Object.keys(t.dark)]),
);

export default definePreview({
  addons: [],
  globalTypes: {
    hostTheme: {
      description: "Simulate MCP host CSS variable overrides",
      toolbar: {
        title: "Host Theme",
        icon: "paintbrush",
        items: [
          { value: "none", title: "Default (no host)" },
          { value: "claude", title: "Claude" },
          { value: "chatgpt", title: "ChatGPT" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "light" },
    hostTheme: "none",
  },
  decorators: [
    (StoryFn, context) => {
      const isDark = context.globals?.backgrounds?.value === "dark";
      const dataTheme = isDark ? "dark" : "light";
      const hostKey = (context.globals?.hostTheme as string) ?? "none";
      const theme = HOST_THEMES[hostKey] ?? null;
      const vars = theme ? (isDark ? theme.dark : theme.light) : {};

      // Apply host variables to :root (mirrors what useHostStyles does in production)
      // This lets the Storybook canvas body pick up --color-background-primary
      const root = document.documentElement;
      // Clear previous theme variables first
      for (const key of ALL_HOST_KEYS) {
        root.style.removeProperty(key);
      }
      // Set current theme variables
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
      }
      // Set canvas background to host background when a theme is active
      // Use cssText with !important to override the backgrounds addon
      if (theme) {
        document.body.style.cssText =
          "background: var(--color-background-primary) !important;";
      } else {
        document.body.style.cssText = "";
      }

      return (
        <div data-theme={dataTheme}>
          <StoryFn />
        </div>
      );
    },
  ],
});
