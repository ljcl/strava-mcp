import { type KnipConfig } from "knip";

export default {
  workspaces: {
    ".": {
      // Story smoke tests: non-default name so vitest's parent-directory
      // config search cannot hijack per-package bare `vitest run`.
      vitest: {
        config: ["vitest.stories.config.ts"],
      },
    },
    "apps/server": {
      project: ["src/**/*.ts"],
      // Resolved at runtime via createRequire(...).resolve("<pkg>/app.html"),
      // which knip cannot trace as a static import.
      ignoreDependencies: [
        "@strava-mcp/activity-chart",
        "@strava-mcp/activity-segments",
        "@strava-mcp/activity-zones",
        "@strava-mcp/cadence-trends",
        "@strava-mcp/compare-activities",
        "@strava-mcp/route-map",
        "@strava-mcp/training-load",
      ],
    },
    "packages/activity-chart": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/activity-zones": {
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
    "packages/compare-activities": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/route-map": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/training-load": {
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
          "../../packages/activity-zones/src/**/*.stories.@(ts|tsx)",
          "../../packages/cadence-trends/src/**/*.stories.@(ts|tsx)",
          "../../packages/compare-activities/src/**/*.stories.@(ts|tsx)",
          "../../packages/route-map/src/**/*.stories.@(ts|tsx)",
          "../../packages/training-load/src/**/*.stories.@(ts|tsx)",
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
        "@strava-mcp/activity-zones",
        "@strava-mcp/cadence-trends",
        "@strava-mcp/compare-activities",
        "@strava-mcp/route-map",
        "@strava-mcp/training-load",
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
