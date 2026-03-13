import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getHostLayout } from "@strava-mcp/data";
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
  safeAreaInsets?: McpUiHostContext["safeAreaInsets"];
  hostContext?: McpUiHostContext;
}

function AppContent({
  app,
  toolArgs,
  safeAreaInsets,
  hostContext,
}: AppContentProps) {
  const layout = getHostLayout(hostContext);
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
      <div style={{ color: "var(--color-text-secondary)", padding: "24px" }}>
        Loading activity data...
      </div>
    );
  }

  if (error || !data || !meta) {
    return (
      <div style={{ color: "var(--color-text-danger, #c00)", padding: "24px" }}>
        {error ?? "No activity data available"}
      </div>
    );
  }

  return (
    <div
      style={{
        paddingBottom: safeAreaInsets?.bottom,
        paddingLeft: safeAreaInsets?.left,
        paddingRight: safeAreaInsets?.right,
        paddingTop: safeAreaInsets?.top,
      }}
    >
      <ActivityChart data={data} meta={meta} laps={laps} layout={layout} />
    </div>
  );
}

function Root() {
  const [toolArgs, setToolArgs] = useState<ToolArgs | null>(null);
  const [safeAreaInsets, setSafeAreaInsets] =
    useState<McpUiHostContext["safeAreaInsets"]>();
  const [hostContext, setHostContext] = useState<
    McpUiHostContext | undefined
  >();

  const { app, error: connectError } = useApp({
    appInfo: { name: "Activity Chart", version: "1.0.0" },
    capabilities: {
      availableDisplayModes: ["inline", "fullscreen"],
    },
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (input) => {
        const args = input.arguments as ToolArgs | undefined;
        if (args?.activity_id) {
          setToolArgs(args);
        }
      };
      createdApp.onhostcontextchanged = (ctx) => {
        if (ctx.safeAreaInsets) {
          setSafeAreaInsets(ctx.safeAreaInsets);
        }
        setHostContext((prev) => ({ ...prev, ...ctx }));
      };
      createdApp.onerror = console.error;
    },
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    const ctx = app?.getHostContext();
    if (ctx) setHostContext(ctx);
  }, [app]);

  if (connectError)
    return (
      <div style={{ padding: "24px" }}>
        Connection error: {connectError.message}
      </div>
    );
  if (!app) return <div style={{ padding: "24px" }}>Connecting...</div>;
  if (!toolArgs)
    return <div style={{ padding: "24px" }}>Waiting for activity data...</div>;

  return (
    <AppContent
      app={app}
      toolArgs={toolArgs}
      safeAreaInsets={safeAreaInsets}
      hostContext={hostContext}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
