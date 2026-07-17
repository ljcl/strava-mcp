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
import { App } from "./App";
import { type ActivityZonesData } from "./types";
import "./global.css";

interface ToolArgs {
  activity_id?: string | number;
}

const LoadingSkeleton = () => (
  <LoadingState label="Loading activity zones">
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
  const { data, loading, error, retry } = useServerToolData<ActivityZonesData>(
    app,
    "get-activity-zones-data",
    { activity_id: toolArgs.activity_id },
  );

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      {loading ? (
        <LoadingSkeleton />
      ) : error || !data ? (
        <ErrorState
          message={error ?? "No zone data available"}
          onRetry={retry}
        />
      ) : (
        <App app={app} data={data} mode={mode} />
      )}
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Activity Zones", version: "1.0.0" },
    parseToolInput: (args) => (args as ToolArgs | undefined) ?? {},
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
  if (toolArgs.activity_id == null) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <ErrorState message="No activity id was provided to the zones view." />
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
