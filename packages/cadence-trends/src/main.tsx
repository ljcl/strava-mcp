import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { getHostLayout } from "@strava-mcp/data";
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
import { type CadenceTrendData } from "./types";
import "./global.css";

interface ToolArgs {
  weeks?: number;
}

const LoadingSkeleton = () => (
  <LoadingState label="Loading cadence trends">
    <Skeleton variant="bar" />
    <Skeleton variant="pills" />
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
  const layout = getHostLayout(hostCtx, mode === "mobile");
  const { data, loading, error, retry } = useServerToolData<CadenceTrendData>(
    app,
    "get-cadence-trend-data",
    { weeks: toolArgs.weeks ?? 6 },
  );

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      {loading ? (
        <LoadingSkeleton />
      ) : error || !data ? (
        <ErrorState
          message={error ?? "No cadence data available"}
          onRetry={retry}
        />
      ) : (
        <App app={app} data={data} layout={layout} mode={mode} />
      )}
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Cadence Trends", version: "1.0.0" },
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

  return (
    <AppContent app={app} toolArgs={toolArgs} hostCtx={hostCtx} mode={mode} />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
