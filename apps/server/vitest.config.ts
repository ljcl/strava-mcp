import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // json-summary feeds the CI job-summary table (scripts/coverage-summary.ts).
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/server.ts",
        "src/index.ts",
        "**/__fixtures__/**",
      ],
      // Regression floor (#162), a few points under the measured baseline
      // (2026-07-16: 82% statements, 71% branches) so genuine coverage drops
      // fail CI without flaking on small refactors. Raise as coverage grows.
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 75,
        lines: 75,
      },
    },
  },
});
