import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { EmptyState } from "./EmptyState";

const meta = preview.meta({
  component: EmptyState,
  // ui primitives are the first package gated on axe (#165).
  parameters: { a11y: { test: "error" } },
});

export const Default = meta.story({
  args: { children: "No segments in this activity" },
});

export const Dark = meta.story({
  globals: darkGlobals,
  args: { children: "No segments in this activity" },
});
