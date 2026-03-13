import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getHostLayout } from "@strava-mcp/data";
import { Skeleton } from "@strava-mcp/ui";
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
      <>
        <Skeleton variant="bar" />
        <Skeleton variant="pills" />
        <Skeleton variant="chart" />
      </>
    );
  }

  if (error || !data) {
    return (
      <div style={{ color: "var(--color-text-danger, #c00)", padding: "24px" }}>
        {error ?? "No cadence data available"}
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
      <App app={app} data={data} layout={layout} />
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
    appInfo: { name: "Cadence Trends", version: "1.0.0" },
    capabilities: {
      availableDisplayModes: ["inline", "fullscreen"],
    },
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = (input) => {
        const args = input.arguments as ToolArgs | undefined;
        setToolArgs(args ?? {});
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
  if (!app)
    return (
      <>
        <Skeleton variant="bar" />
        <Skeleton variant="pills" />
        <Skeleton variant="chart" />
      </>
    );
  if (!toolArgs)
    return (
      <>
        <Skeleton variant="bar" />
        <Skeleton variant="pills" />
        <Skeleton variant="chart" />
      </>
    );

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
