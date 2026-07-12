import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { getHostLayout } from "@strava-mcp/data";
import {
  type AppMode,
  AppShell,
  ErrorState,
  type HostCtx,
  Skeleton,
  useHostRoot,
  useServerToolData,
} from "@strava-mcp/ui";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ActivityChart } from "./ActivityChart";
import { extractMeta, toChartData, toLapData } from "./normalize";
import { type ActivityStreamData } from "./types";
import "./global.css";

interface ToolArgs {
  activity_id: string;
}

const LoadingSkeleton = () => <Skeleton variant="chart" />;

interface AppContentProps {
  app: ReturnType<typeof useApp>["app"];
  toolArgs: ToolArgs;
  hostCtx: HostCtx;
  mode: AppMode;
}

function AppContent({ app, toolArgs, hostCtx, mode }: AppContentProps) {
  const layout = getHostLayout(hostCtx, mode === "mobile");
  const {
    data: streamData,
    loading,
    error,
    retry,
  } = useServerToolData<ActivityStreamData>(app, "get-activity-streams-raw", {
    activity_id: toolArgs.activity_id,
  });

  const derived = useMemo(
    () =>
      streamData
        ? {
            meta: extractMeta(streamData),
            data: toChartData(streamData),
            laps: toLapData(streamData),
          }
        : null,
    [streamData],
  );

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      {loading ? (
        <LoadingSkeleton />
      ) : error || !derived ? (
        <ErrorState
          message={error ?? "No activity data available"}
          onRetry={retry}
        />
      ) : (
        <ActivityChart
          data={derived.data}
          meta={derived.meta}
          laps={derived.laps}
          layout={layout}
          mode={mode}
          app={app ?? undefined}
        />
      )}
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Activity Chart", version: "1.0.0" },
    parseToolInput: (args) => {
      const next = args as ToolArgs | undefined;
      return next?.activity_id ? next : null;
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
