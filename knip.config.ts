import { type KnipConfig } from "knip";

export default {
  workspaces: {
    "apps/server": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
      ignore: ["**/*.test.ts", "**/__fixtures__/**"],
    },
    "packages/activity-chart": {
      entry: ["src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
      ignore: ["vite-env.d.ts"],
    },
    "packages/design-system": {
      project: ["src/**/*.{ts,tsx}"],
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
