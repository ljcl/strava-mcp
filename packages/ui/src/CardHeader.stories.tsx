import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { CardHeader } from "./CardHeader";

const meta = preview.meta({
  component: CardHeader,
  // ui primitives are the first package gated on axe (#165).
  parameters: { a11y: { test: "error" } },
});

export const Default = meta.story({
  args: { title: "Morning Run", subtitle: "Run · 10.2 km · 52:31" },
});

export const TitleOnly = meta.story({
  args: { title: "Morning Run" },
});

export const Compact = meta.story({
  args: {
    title: "Morning Run",
    subtitle: "Run · 10.2 km · 52:31",
    compact: true,
  },
});

export const Dark = meta.story({
  globals: darkGlobals,
  args: { title: "Morning Run", subtitle: "Run · 10.2 km · 52:31" },
});
