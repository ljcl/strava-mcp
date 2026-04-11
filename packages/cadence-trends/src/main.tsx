import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getHostLayout } from "@strava-mcp/data";
import { type HostCtx, Skeleton, useMobileMode } from "@strava-mcp/ui";
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
  mode: "mobile" | "desktop";
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

  const safeAreaInsets = hostCtx.safeAreaInsets;
  const basePad = mode === "mobile" ? { y: 16, x: 14 } : { y: 24, x: 20 };
  const outerMargin = mode === "mobile" ? 3 : 0;

  const cardStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: `calc(100% - ${outerMargin * 2}px)`,
    margin: outerMargin,
    background: "var(--color-background-primary)",
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    paddingBottom: `calc(${basePad.y}px + ${safeAreaInsets?.bottom ?? 0}px)`,
    paddingLeft: `calc(${basePad.x}px + ${safeAreaInsets?.left ?? 0}px)`,
    paddingRight: `calc(${basePad.x}px + ${safeAreaInsets?.right ?? 0}px)`,
    paddingTop: `calc(${basePad.y}px + ${safeAreaInsets?.top ?? 0}px)`,
    overflow: "hidden",
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <Skeleton variant="bar" />
        <Skeleton variant="pills" />
        <Skeleton variant="chart" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={cardStyle}>
        <div style={{ color: "var(--color-text-danger, #c00)" }}>
          {error ?? "No cadence data available"}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <App app={app} data={data} layout={layout} mode={mode} />
    </div>
  );
}

function Root() {
  const [toolArgs, setToolArgs] = useState<ToolArgs | null>(null);
  const [hostCtx, setHostCtx] = useState<HostCtx>({});

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
      createdApp.onhostcontextchanged = (ctx: McpUiHostContext) => {
        setHostCtx({
          platform: ctx.platform,
          containerDimensions: ctx.containerDimensions,
          safeAreaInsets: ctx.safeAreaInsets,
          deviceCapabilities: ctx.deviceCapabilities,
          userAgent: ctx.userAgent,
        });
      };
      createdApp.onerror = console.error;
    },
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    const ctx = app?.getHostContext();
    if (ctx) {
      setHostCtx({
        platform: ctx.platform,
        containerDimensions: ctx.containerDimensions,
        safeAreaInsets: ctx.safeAreaInsets,
        deviceCapabilities: ctx.deviceCapabilities,
        userAgent: ctx.userAgent,
      });
    }
  }, [app]);

  const isMobile = useMobileMode(hostCtx);
  const mode: "mobile" | "desktop" = isMobile ? "mobile" : "desktop";

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
