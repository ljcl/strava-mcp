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
import { ActivitySegments } from "./ActivitySegments";
import { type ActivitySegmentsData, type ToolArgs } from "./types";
import "./global.css";

function parseActivitySegmentsData(
  result: CallToolResult,
): ActivitySegmentsData | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as ActivitySegmentsData;
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
  const [data, setData] = useState<ActivitySegmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: "get-activity-segments-data",
        arguments: { ...toolArgs },
      });
      const segmentsData = parseActivitySegmentsData(result);
      if (!segmentsData) {
        setError("Failed to parse activity segments data");
        return;
      }
      setData(segmentsData);
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
          {error ?? "No activity segments data available"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hostCtx={hostCtx} mode={mode}>
      <ActivitySegments data={data} mode={mode} />
    </AppShell>
  );
}

function Root() {
  const { app, hostCtx, mode, toolArgs, connectError } = useHostRoot<ToolArgs>({
    appInfo: { name: "Activity Segments", version: "1.0.0" },
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
