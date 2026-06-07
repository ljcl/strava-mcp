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
import { App } from "./App";
import { type CadenceTrendData } from "./types";
import "./global.css";

interface ToolArgs {
  weeks?: number;
}

function parseTrendData(result: CallToolResult): CadenceTrendData | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as CadenceTrendData;
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
  const [data, setData] = useState<CadenceTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: "get-cadence-trend-data",
        arguments: { weeks: toolArgs.weeks ?? 6 },
      });
      const trendData = parseTrendData(result);
      if (!trendData) {
        setError("Failed to parse trend data");
        return;
      }
      setData(trendData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [app, toolArgs.weeks]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <Skeleton variant="bar" />
        <Skeleton variant="pills" />
        <Skeleton variant="chart" />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell hostCtx={hostCtx} mode={mode}>
        <div style={{ color: "var(--color-text-danger, #c00)" }}>
          {error ?? "No cadence data available"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      <App app={app} data={data} layout={layout} mode={mode} />
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Cadence Trends", version: "1.0.0" },
    parseToolInput: (args) => (args as ToolArgs | undefined) ?? {},
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
        <Skeleton variant="pills" />
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
