import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getHostLayout } from "@strava-mcp/data";
import {
  type AppMode,
  AppShell,
  type HostCtx,
  Skeleton,
  useHostRoot,
} from "@strava-mcp/ui";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ActivityChart } from "./ActivityChart";
import {
  type ChartLap,
  extractMeta,
  toChartData,
  toLapData,
} from "./normalize";
import { type ActivityStreamData, type ChartDataPoint } from "./types";
import "./global.css";

interface ToolArgs {
  activity_id: string;
}

function parseStreamData(result: CallToolResult): ActivityStreamData | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as ActivityStreamData;
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
  const layout = getHostLayout(hostCtx, mode === "mobile");
  const [data, setData] = useState<ChartDataPoint[] | null>(null);
  const [meta, setMeta] = useState<ReturnType<typeof extractMeta> | null>(null);
  const [laps, setLaps] = useState<ChartLap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStreams = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: "get-activity-streams-raw",
        arguments: { activity_id: toolArgs.activity_id },
      });
      const streamData = parseStreamData(result);
      if (!streamData) {
        setError("Failed to parse stream data");
        return;
      }
      setMeta(extractMeta(streamData));
      setData(toChartData(streamData));
      setLaps(toLapData(streamData));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [app, toolArgs.activity_id]);

  useEffect(() => {
    void fetchStreams();
  }, [fetchStreams]);

  if (loading) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <Skeleton variant="chart" />
      </AppShell>
    );
  }

  if (error || !data || !meta) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <div style={{ color: "var(--color-text-danger, #c00)" }}>
          {error ?? "No activity data available"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      <ActivityChart
        data={data}
        meta={meta}
        laps={laps}
        layout={layout}
        mode={mode}
        app={app ?? undefined}
      />
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

  if (connectError)
    return (
      <div style={{ padding: "24px" }}>
        Connection error: {connectError.message}
      </div>
    );
  if (!app) return <Skeleton variant="chart" />;
  if (!toolArgs) return <Skeleton variant="chart" />;

  return (
    <AppContent app={app} toolArgs={toolArgs} hostCtx={hostCtx} mode={mode} />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
