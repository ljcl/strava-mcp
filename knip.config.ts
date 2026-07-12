import { type KnipConfig } from "knip";

export default {
  workspaces: {
    "apps/server": {
      project: ["src/**/*.ts"],
      // Resolved at runtime via createRequire(...).resolve("<pkg>/app.html"),
      // which knip cannot trace as a static import.
      ignoreDependencies: [
        "@strava-mcp/activity-chart",
        "@strava-mcp/activity-segments",
        "@strava-mcp/cadence-trends",
        "@strava-mcp/route-map",
      ],
    },
    "packages/activity-chart": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/activity-segments": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/cadence-trends": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/route-map": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/data": {
      // useHostLayout.ts imports `McpUiHostContext` as a type-only import,
      // which knip does not count toward dependency usage.
      ignoreDependencies: ["@modelcontextprotocol/ext-apps"],
    },
    "packages/design-system": {
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/ui": {
      project: ["src/**/*.{ts,tsx}"],
    },
    "apps/storybook": {
      storybook: {
        config: [".storybook/main.ts"],
        entry: [
          ".storybook/{manager,preview,index,vitest.setup}.{js,jsx,ts,tsx}",
          "../../packages/activity-chart/src/**/*.stories.@(ts|tsx)",
          "../../packages/activity-segments/src/**/*.stories.@(ts|tsx)",
          "../../packages/cadence-trends/src/**/*.stories.@(ts|tsx)",
          "../../packages/route-map/src/**/*.stories.@(ts|tsx)",
          "../../packages/design-system/stories/**/*.stories.@(ts|tsx)",
          "../../packages/ui/src/**/*.stories.@(ts|tsx)",
        ],
        project: [".storybook/**/*.{js,jsx,ts,tsx,mts}"],
      },
      // Consumed by Storybook's `stories` directory globs at build time (the
      // story files are co-located in each package and import relatively), so
      // there is no static `@strava-mcp/*` import for knip to follow.
      ignoreDependencies: [
        "@strava-mcp/activity-chart",
        "@strava-mcp/activity-segments",
        "@strava-mcp/cadence-trends",
        "@strava-mcp/route-map",
        "@strava-mcp/ui",
      ],
    },
  },
  ignoreExportsUsedInFile: true,
  compilers: {
    css: (text: string) =>
      [...text.matchAll(/@(?:import|plugin)\s+["']([^"']+)["']/g)]
        .map(([_, dep]) => `import "${dep}";`)
        .join("\n"),
  },
} satisfies KnipConfig;
