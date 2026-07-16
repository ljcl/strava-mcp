import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { AppShell } from "./AppShell";
import { CardHeader } from "./CardHeader";
import { EmptyState } from "./EmptyState";

const meta = preview.meta({
  component: AppShell,
  // ui primitives are the first package gated on axe (#165).
  parameters: { a11y: { test: "error" } },
});

const content = (
  <>
    <CardHeader title="Morning Run" subtitle="Run · 10.2 km" />
    <EmptyState>Card content renders here</EmptyState>
  </>
);

export const Desktop = meta.story({
  render: () => (
    <AppShell hostCtx={{}} mode="desktop">
      {content}
    </AppShell>
  ),
});

export const Dark = meta.story({
  globals: darkGlobals,
  render: () => (
    <AppShell hostCtx={{}} mode="desktop">
      {content}
    </AppShell>
  ),
});

export const Mobile = meta.story({
  render: () => (
    <AppShell hostCtx={{}} mode="mobile">
      {content}
    </AppShell>
  ),
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
});

export const MobileWithSafeAreaInsets = meta.story({
  render: () => (
    <AppShell
      hostCtx={{
        safeAreaInsets: { top: 12, right: 10, bottom: 24, left: 10 },
      }}
      mode="mobile"
    >
      {content}
    </AppShell>
  ),
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
});

export const DesktopWithSafeAreaInsets = meta.story({
  render: () => (
    <AppShell
      hostCtx={{
        safeAreaInsets: { top: 12, right: 10, bottom: 24, left: 10 },
      }}
      mode="desktop"
    >
      {content}
    </AppShell>
  ),
});
