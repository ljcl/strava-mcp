import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type AppMode,
  AppShell,
  type HostCtx,
  Skeleton,
  useHostRoot,
} from "@strava-mcp/ui";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouteMap } from "./RouteMap";
import {
  runTileProbe,
  TILE_PROBE_ENABLED,
  type TileProbeResult,
} from "./tileProbe";
import { type RouteMapData, type ToolArgs } from "./types";
import "./global.css";

/**
 * Basemap spike scaffolding (#60) — REMOVE once the spike is resolved.
 * Renders the tile-probe outcome under the map so it can be read in the
 * Claude host (desktop + iOS). Styled inline because it is throwaway.
 */
function TileProbeBadge() {
  const [result, setResult] = useState<TileProbeResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    void runTileProbe().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 12,
        color: result?.ok
          ? "var(--color-text-success, #275b19)"
          : "var(--color-text-danger, #7f2c28)",
      }}
    >
      Basemap tile probe: {result ? (result.ok ? "✓ " : "✗ ") : "…"}
      {result?.detail ?? "running"}
    </div>
  );
}

function parseRouteMapData(result: CallToolResult): RouteMapData | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as RouteMapData;
  } catch {
    return null;
  }
}

interface AppContentProps {
  app: ReturnType<typeof useApp>["app"];
  toolArgs: ToolArgs;
  hostCtx: HostCtx;
  mode: AppMode;
}

function AppContent({ app, toolArgs, hostCtx, mode }: AppContentProps) {
  const [data, setData] = useState<RouteMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: "get-route-map-data",
        arguments: { ...toolArgs },
      });
      const routeData = parseRouteMapData(result);
      if (!routeData) {
        setError("Failed to parse route map data");
        return;
      }
      setData(routeData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [app, toolArgs]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <Skeleton variant="bar" />
        <Skeleton variant="chart" />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <div style={{ color: "var(--color-text-danger, #c00)" }}>
          {error ?? "No route map data available"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      <RouteMap data={data} mode={mode} app={app ?? undefined} />
      {TILE_PROBE_ENABLED && <TileProbeBadge />}
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Route Map", version: "1.0.0" },
    parseToolInput: (args) => {
      const next = args as ToolArgs | undefined;
      return next?.activity_id || next?.route_id ? next : null;
    },
  });

  if (connectError)
    return (
      <div style={{ padding: "24px" }}>
        Connection error: {connectError.message}
      </div>
    );
  if (!app || !toolArgs) {
    return (
      <>
        <Skeleton variant="bar" />
        <Skeleton variant="chart" />
      </>
    );
  }

  return (
    <AppContent app={app} toolArgs={toolArgs} hostCtx={hostCtx} mode={mode} />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
