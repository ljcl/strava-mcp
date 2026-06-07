import {
  type App,
  type McpUiAppCapabilities,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { type HostCtx, useMobileMode } from "./useMobileMode";

/** Layout mode every MCP App view switches on. */
export type AppMode = "mobile" | "desktop";

const DEFAULT_CAPABILITIES: McpUiAppCapabilities = {
  availableDisplayModes: ["inline", "fullscreen"],
};

/** Narrow the raw ext-apps host context down to the fields we react to. */
function pickHostCtx(ctx: McpUiHostContext): HostCtx {
  return {
    platform: ctx.platform,
    containerDimensions: ctx.containerDimensions,
    safeAreaInsets: ctx.safeAreaInsets,
    deviceCapabilities: ctx.deviceCapabilities,
    userAgent: ctx.userAgent,
  };
}

export interface UseHostRootOptions<TArgs> {
  /** App identity passed to the underlying `useApp` hook. */
  appInfo: { name: string; version: string };
  /**
   * Map raw tool input arguments to the app's typed args. Return `null` to
   * ignore the input and keep waiting (e.g. a required id is still missing).
   */
  parseToolInput: (args: unknown) => TArgs | null;
  /** Display modes the app advertises. Defaults to inline + fullscreen. */
  capabilities?: McpUiAppCapabilities;
}

export interface HostRoot<TArgs> {
  /** Connected ext-apps `App`, or `null` until the handshake completes. */
  app: App | null;
  /** Host context subset that drives mobile detection and card chrome. */
  hostCtx: HostCtx;
  /** Resolved layout mode from `useMobileMode`. */
  mode: AppMode;
  /** Parsed tool args, or `null` until the host sends usable input. */
  toolArgs: TArgs | null;
  /** Connection error from the initialization handshake, if any. */
  connectError: Error | null;
}

/**
 * Owns the host-context scaffolding every MCP App needs at its root:
 * `useApp` wiring, tool-input parsing, host-context state plumbing,
 * `useHostStyles`, and mobile detection. Each app's `main.tsx` consumes
 * this instead of duplicating the `Root` boilerplate.
 */
export function useHostRoot<TArgs>({
  appInfo,
  parseToolInput,
  capabilities = DEFAULT_CAPABILITIES,
}: UseHostRootOptions<TArgs>): HostRoot<TArgs> {
  const [toolArgs, setToolArgs] = useState<TArgs | null>(null);
  const [hostCtx, setHostCtx] = useState<HostCtx>({});

  const { app, error: connectError } = useApp({
    appInfo,
    capabilities,
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (input) => {
        const next = parseToolInput(input.arguments);
        if (next !== null) setToolArgs(next);
      };
      createdApp.onhostcontextchanged = (ctx) => {
        setHostCtx(pickHostCtx(ctx));
      };
      createdApp.onerror = console.error;
    },
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    const ctx = app?.getHostContext();
    if (ctx) setHostCtx(pickHostCtx(ctx));
  }, [app]);

  const isMobile = useMobileMode(hostCtx);
  const mode: AppMode = isMobile ? "mobile" : "desktop";

  return { app, hostCtx, mode, toolArgs, connectError };
}

/** Compute the outer card chrome (safe-area insets, margin, width clamp). */
function cardStyle(hostCtx: HostCtx, mode: AppMode): CSSProperties {
  const safeAreaInsets = hostCtx.safeAreaInsets;
  const basePad = mode === "mobile" ? { y: 16, x: 14 } : { y: 24, x: 20 };
  // Small outer margin on mobile so the card's border isn't clipped by
  // the host iframe edge (seen on Claude iOS where the chat card gives
  // the app iframe zero surrounding padding).
  const outerMargin = mode === "mobile" ? 3 : 0;

  return {
    boxSizing: "border-box",
    // Always fill the iframe minus the outer margin so nothing inside
    // can force the card wider than the host viewport (the cause of
    // the horizontal scroll we saw on Claude iOS).
    width: `calc(100% - ${outerMargin * 2}px)`,
    margin: outerMargin,
    background: "var(--color-background-primary)",
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    paddingBottom: `calc(${basePad.y}px + ${safeAreaInsets?.bottom ?? 0}px)`,
    paddingLeft: `calc(${basePad.x}px + ${safeAreaInsets?.left ?? 0}px)`,
    paddingRight: `calc(${basePad.x}px + ${safeAreaInsets?.right ?? 0}px)`,
    paddingTop: `calc(${basePad.y}px + ${safeAreaInsets?.top ?? 0}px)`,
    overflow: "hidden",
  };
}

export interface AppShellProps {
  hostCtx: HostCtx;
  mode: AppMode;
  children: ReactNode;
}

/**
 * Outer card shell shared by every MCP App. Wraps content in the bordered
 * card with safe-area-aware padding, outer margin, and width clamp that
 * the host chrome rules in CLAUDE.md depend on staying identical.
 */
export function AppShell({ hostCtx, mode, children }: AppShellProps) {
  return <div style={cardStyle(hostCtx, mode)}>{children}</div>;
}
