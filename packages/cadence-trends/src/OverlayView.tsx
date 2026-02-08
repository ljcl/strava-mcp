import { Legend, LegendItem } from "@strava-mcp/ui";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./OverlayView.module.css";
import { COMPARISON_COLORS, type OverlayPoint, type RunSummary } from "./types";

interface CachedStream {
  run: RunSummary;
  points: OverlayPoint[];
}

interface OverlayViewProps {
  selectedRunIds: Set<number>;
  streamCache: Map<number, CachedStream>;
  loadingStreams: Set<number>;
  fetchStreamForRun: (runId: number) => void;
}

type XMode = "distance" | "time";

export function OverlayView({
  selectedRunIds,
  streamCache,
  loadingStreams,
  fetchStreamForRun,
}: OverlayViewProps) {
  const [xMode, setXMode] = useState<XMode>("distance");
  const [hiddenRuns, setHiddenRuns] = useState<Set<number>>(new Set());

  // Trigger fetch for selected runs not yet cached
  useEffect(() => {
    for (const id of selectedRunIds) {
      if (!streamCache.has(id)) {
        fetchStreamForRun(id);
      }
    }
  }, [selectedRunIds, streamCache, fetchStreamForRun]);

  const runs = useMemo(() => {
    const entries: Array<CachedStream & { color: string }> = [];
    let colorIdx = 0;
    for (const id of selectedRunIds) {
      const cached = streamCache.get(id);
      if (cached) {
        entries.push({
          ...cached,
          color: COMPARISON_COLORS[colorIdx % COMPARISON_COLORS.length]!,
        });
        colorIdx += 1;
      }
    }
    return entries;
  }, [selectedRunIds, streamCache]);

  // Merge all runs into a unified dataset keyed by x-axis value
  const { chartData, runKeys } = useMemo(() => {
    if (runs.length === 0) return { chartData: [], runKeys: [] as string[] };

    const keys = runs.map((r) => `cadence_${r.run.id}`);

    const allPoints = runs.map((r) => r.points);
    const maxLen = Math.max(...allPoints.map((p) => p.length));

    // Sample every N points to keep chart responsive
    const step = Math.max(1, Math.floor(maxLen / 500));

    const merged: Array<Record<string, number | undefined>> = [];
    for (let i = 0; i < maxLen; i += step) {
      const row: Record<string, number | undefined> = {};
      for (let r = 0; r < runs.length; r += 1) {
        const pts = allPoints[r]!;
        const pt = pts[Math.min(i, pts.length - 1)];
        if (pt) {
          row.x = xMode === "distance" ? pt.distance : pt.time;
          row[keys[r]!] = pt.cadence;
        }
      }
      if (row.x !== undefined) merged.push(row);
    }

    return { chartData: merged, runKeys: keys };
  }, [runs, xMode]);

  const isLoading = [...selectedRunIds].some((id) => loadingStreams.has(id));

  if (selectedRunIds.size === 0) {
    return (
      <div className={styles.empty}>
        Click runs in Trend or Scatter view to compare them here
      </div>
    );
  }

  return (
    <div>
      {isLoading && (
        <div className={styles.loading}>Loading stream data...</div>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 8,
          alignItems: "center",
        }}
      >
        <Legend>
          {runs.map((r) => (
            <LegendItem
              key={r.run.id}
              color={r.color}
              label={`${r.run.name} · ${new Date(r.run.date).toLocaleDateString()}`}
              hidden={hiddenRuns.has(r.run.id)}
              onClick={() => {
                setHiddenRuns((prev) => {
                  const next = new Set(prev);
                  if (next.has(r.run.id)) next.delete(r.run.id);
                  else next.add(r.run.id);
                  return next;
                });
              }}
            />
          ))}
        </Legend>
        <button
          type="button"
          onClick={() => setXMode(xMode === "distance" ? "time" : "distance")}
          style={{
            border: "1px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-sm)",
            padding: "2px 8px",
            fontSize: "var(--font-text-xs-size)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          {xMode === "distance" ? "km" : "min"}
        </button>
      </div>
      <div className={styles.container}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-tertiary)"
            />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-secondary)" }}
              label={{
                value: xMode === "distance" ? "km" : "min",
                position: "insideBottomRight",
                offset: -4,
                style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
              }}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "spm",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
              }}
            />
            <RechartsTooltip
              labelFormatter={(v) => {
                const n = Number(v);
                return xMode === "distance"
                  ? `${n.toFixed(1)} km`
                  : `${n.toFixed(0)} min`;
              }}
            />
            {runs.map((r, i) => (
              <Line
                key={r.run.id}
                type="monotone"
                dataKey={runKeys[i]}
                stroke={r.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                hide={hiddenRuns.has(r.run.id)}
                name={r.run.name}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
