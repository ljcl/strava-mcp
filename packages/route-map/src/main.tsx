import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import {
  type AppMode,
  AppShell,
  ErrorState,
  type HostCtx,
  LoadingState,
  Skeleton,
  useHostRoot,
  useServerToolData,
} from "@strava-mcp/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouteMap } from "./RouteMap";
import { type RouteMapData, type ToolArgs } from "./types";
import "./global.css";

const LoadingSkeleton = () => (
  <LoadingState label="Loading route map">
    <Skeleton variant="bar" />
    <Skeleton variant="chart" />
  </LoadingState>
);

interface AppContentProps {
  app: ReturnType<typeof useApp>["app"];
  toolArgs: ToolArgs;
  hostCtx: HostCtx;
  mode: AppMode;
}

function AppContent({ app, toolArgs, hostCtx, mode }: AppContentProps) {
  const { data, loading, error, retry } = useServerToolData<RouteMapData>(
    app,
    "get-route-map-data",
    { ...toolArgs },
  );

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      {loading ? (
        <LoadingSkeleton />
      ) : error || !data ? (
        <ErrorState
          message={error ?? "No route map data available"}
          onRetry={retry}
        />
      ) : (
        <RouteMap data={data} mode={mode} app={app ?? undefined} />
      )}
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

  // Pre-connect states render inside the same shell as the loaded app so
  // the card chrome is stable from first paint (#116).
  if (connectError) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <ErrorState message={`Connection error: ${connectError.message}`} />
      </AppShell>
    );
  }
  if (!app || !toolArgs) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <LoadingSkeleton />
      </AppShell>
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
