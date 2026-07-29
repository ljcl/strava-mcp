import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { getHostLayout } from "@strava-mcp/data";
import {
  type AppMode,
  AppRoot,
  AppShell,
  ErrorState,
  type HostCtx,
  LoadingState,
  Skeleton,
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
    <AppShell hostCtx={hostCtx} mode={mode} app={app}>
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
  return (
    <AppRoot<ToolArgs>
      appInfo={{ name: "Cadence Trends", version: "1.0.0" }}
      // Every argument is optional, so no input can be unusable and no
      // `missingArgsMessage` applies — the window falls back to a default.
      parseToolInput={(args) => (args as ToolArgs | undefined) ?? {}}
      loading={<LoadingSkeleton />}
    >
      {({ app, toolArgs, hostCtx, mode }) => (
        <AppContent
          app={app}
          toolArgs={toolArgs}
          hostCtx={hostCtx}
          mode={mode}
        />
      )}
    </AppRoot>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
