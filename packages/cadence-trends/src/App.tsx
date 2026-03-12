import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type HostLayout } from "@strava-mcp/data";
import { Pill, PillGroup } from "@strava-mcp/ui";
import { useCallback, useMemo, useState } from "react";
import styles from "./App.module.css";
import {
  computeSummaryStats,
  smoothOverlayPoints,
  toOverlayPoints,
} from "./normalize";
import { OverlayView } from "./OverlayView";
import { ScatterView } from "./ScatterView";
import { SummaryBar } from "./SummaryBar";
import { TrendView } from "./TrendView";
import {
  type CadenceTrendData,
  type OverlayPoint,
  type OverlayStreamData,
  type RunSummary,
  type ViewId,
} from "./types";
import { ZonesView } from "./ZonesView";

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "trend", label: "Trend" },
  { id: "scatter", label: "Scatter" },
  { id: "zones", label: "Zones" },
  { id: "overlay", label: "Overlay" },
];

interface AppProps {
  app: ReturnType<typeof useApp>["app"];
  data: CadenceTrendData;
  layout?: HostLayout;
}

interface CachedStream {
  run: RunSummary;
  points: OverlayPoint[];
}

export function App({ app, data, layout }: AppProps) {
  const [activeView, setActiveView] = useState<ViewId>("trend");
  const [selectedRunIds, setSelectedRunIds] = useState<Set<number>>(new Set());
  const [streamCache, setStreamCache] = useState<Map<number, CachedStream>>(
    new Map(),
  );
  const [loadingStreams, setLoadingStreams] = useState<Set<number>>(new Set());

  const stats = useMemo(
    () => computeSummaryStats(data.activities, data.weeks),
    [data],
  );

  const toggleRunSelection = useCallback((runId: number) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else if (next.size < 4) {
        next.add(runId);
      }
      return next;
    });
  }, []);

  const removeRun = useCallback((runId: number) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
  }, []);

  const fetchStreamForRun = useCallback(
    async (runId: number) => {
      if (!app || streamCache.has(runId) || loadingStreams.has(runId)) return;
      setLoadingStreams((prev) => new Set(prev).add(runId));
      try {
        const result: CallToolResult = await app.callServerTool({
          name: "get-activity-streams-raw",
          arguments: { activity_id: String(runId) },
        });
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (text) {
          const streamData = JSON.parse(text) as OverlayStreamData;
          const run = data.activities.find((a) => a.id === runId);
          if (run) {
            const points = smoothOverlayPoints(toOverlayPoints(streamData));
            setStreamCache((prev) => new Map(prev).set(runId, { run, points }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch streams for run", runId, err);
      } finally {
        setLoadingStreams((prev) => {
          const next = new Set(prev);
          next.delete(runId);
          return next;
        });
      }
    },
    [app, streamCache, loadingStreams, data.activities],
  );

  const selectedRuns = data.activities.filter((a) => selectedRunIds.has(a.id));

  return (
    <div
      className={styles.container}
      data-compact={layout?.mode === "compact" || undefined}
    >
      <SummaryBar
        currentAvg={stats.currentAvg}
        delta={stats.delta}
        runCount={stats.runCount}
        weeks={data.weeks}
      />
      <div className={styles.nav}>
        <PillGroup>
          {VIEWS.map((v) => (
            <Pill
              key={v.id}
              active={activeView === v.id}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </Pill>
          ))}
        </PillGroup>
      </div>
      <div className={styles.viewContainer}>
        {activeView === "trend" && (
          <TrendView
            activities={data.activities}
            onRunClick={toggleRunSelection}
            selectedRunIds={selectedRunIds}
          />
        )}
        {activeView === "scatter" && (
          <ScatterView
            activities={data.activities}
            onRunClick={toggleRunSelection}
            selectedRunIds={selectedRunIds}
          />
        )}
        {activeView === "zones" && <ZonesView activities={data.activities} />}
        {activeView === "overlay" && (
          <OverlayView
            selectedRunIds={selectedRunIds}
            streamCache={streamCache}
            loadingStreams={loadingStreams}
            fetchStreamForRun={fetchStreamForRun}
          />
        )}
      </div>
      {selectedRuns.length > 0 && (
        <div className={styles.selectionBar}>
          {selectedRuns.map((run) => (
            <div key={run.id} className={styles.selectedRun}>
              <span>
                {run.name} · {new Date(run.date).toLocaleDateString()}
              </span>
              <button type="button" onClick={() => removeRun(run.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
