import { type useApp } from "@modelcontextprotocol/ext-apps/react";
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
import { type FitnessTrendData } from "./types";
import "./global.css";

interface ToolArgs {
  days?: number;
  projectDays?: number;
  targetDate?: string;
  targetTsb?: number;
}

const LoadingSkeleton = () => (
  <LoadingState label="Loading fitness trend">
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
  const { data, loading, error, retry } = useServerToolData<FitnessTrendData>(
    app,
    "get-fitness-trend-data",
    {
      days: toolArgs.days ?? 90,
      projectDays: toolArgs.projectDays ?? 14,
      ...(toolArgs.targetDate ? { targetDate: toolArgs.targetDate } : {}),
      ...(toolArgs.targetTsb !== undefined
        ? { targetTsb: toolArgs.targetTsb }
        : {}),
    },
  );

  return (
    <AppShell hostCtx={hostCtx} mode={mode} app={app}>
      {loading ? (
        <LoadingSkeleton />
      ) : error || !data ? (
        <ErrorState
          message={error ?? "No fitness trend data available"}
          onRetry={retry}
        />
      ) : (
        <App app={app} data={data} mode={mode} />
      )}
    </AppShell>
  );
}

function Root() {
  return (
    <AppRoot<ToolArgs>
      appInfo={{ name: "Fitness Trend", version: "1.0.0" }}
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
