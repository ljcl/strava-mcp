import { type KnipConfig } from "knip";

export default {
  workspaces: {
    "apps/server": {
      project: ["src/**/*.ts"],
      ignore: ["**/*.test.ts", "**/__fixtures__/**"],
    },
    "packages/activity-chart": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
      ignore: ["vite-env.d.ts"],
      ignoreDependencies: ["@strava-mcp/design-system"],
    },
    "packages/design-system": {
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: ["@strava-mcp/tsconfig"],
    },
    "packages/ui": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: ["@strava-mcp/design-system"],
    },
    "apps/storybook": {
      storybook: {
        config: [".storybook/main.ts"],
        entry: [
          ".storybook/{manager,preview,index,vitest.setup}.{js,jsx,ts,tsx}",
          "../../../packages/activity-chart/src/**/*.stories.@(ts|tsx)",
          "../../../packages/design-system/stories/**/*.stories.@(ts|tsx)",
          "../../../packages/ui/src/**/*.stories.@(ts|tsx)",
        ],
        project: [".storybook/**/*.{js,jsx,ts,tsx,mts}"],
      },
      ignoreDependencies: ["@strava-mcp/tsconfig"],
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
