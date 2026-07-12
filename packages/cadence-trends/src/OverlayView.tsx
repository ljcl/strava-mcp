import { GRID_DASHARRAY, getChartTokens } from "@strava-mcp/design-system";
import { Legend, LegendItem, Pill, PillGroup } from "@strava-mcp/ui";
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
import { resampleOverlayRuns } from "./normalize";
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
  mode?: "mobile" | "desktop";
}

type XMode = "distance" | "time";

export function OverlayView({
  selectedRunIds,
  streamCache,
  loadingStreams,
  fetchStreamForRun,
  mode = "desktop",
}: OverlayViewProps) {
  const isMobile = mode === "mobile";
  const chartTokens = getChartTokens(mode);
  const tokens = {
    ...chartTokens,
    marginRight: isMobile ? 8 : 16,
    marginLeft: isMobile ? -8 : 0,
    marginBottom: 24,
    // OverlayView stacks many streams; use the lighter secondary stroke.
    strokeWidth: chartTokens.secondaryStrokeWidth,
  };

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

  // Resample every run onto a shared x grid so runs at different speeds
  // stay aligned and shorter runs end at their own extent.
  const { chartData, runKeys } = useMemo(() => {
    if (runs.length === 0) return { chartData: [], runKeys: [] as string[] };
    return {
      chartData: resampleOverlayRuns(
        runs.map((r) => ({ id: r.run.id, points: r.points })),
        xMode,
      ),
      runKeys: runs.map((r) => `cadence_${r.run.id}`),
    };
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
      <div className={styles.container}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: 8,
              right: tokens.marginRight,
              bottom: tokens.marginBottom,
              left: tokens.marginLeft,
            }}
          >
            <CartesianGrid
              strokeDasharray={GRID_DASHARRAY}
              stroke="var(--color-border-tertiary)"
            />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tick={{
                fontSize: tokens.axisFont,
                fill: "var(--color-text-tertiary)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-secondary)" }}
              label={
                isMobile
                  ? undefined
                  : {
                      value: xMode === "distance" ? "km" : "min",
                      position: "insideBottomRight",
                      offset: -4,
                      style: {
                        fontSize: tokens.axisFont,
                        fill: "var(--color-text-tertiary)",
                      },
                    }
              }
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{
                fontSize: tokens.axisFont,
                fill: "var(--color-text-tertiary)",
              }}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 34 : 40}
              label={
                isMobile
                  ? undefined
                  : {
                      value: "spm",
                      angle: -90,
                      position: "insideLeft",
                      style: {
                        fontSize: 11,
                        fill: "var(--color-text-tertiary)",
                      },
                    }
              }
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
                strokeWidth={tokens.strokeWidth}
                dot={false}
                hide={hiddenRuns.has(r.run.id)}
                name={r.run.name}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.footer}>
        <PillGroup>
          <Pill
            active={xMode === "distance"}
            onClick={() => setXMode("distance")}
          >
            km
          </Pill>
          <Pill active={xMode === "time"} onClick={() => setXMode("time")}>
            min
          </Pill>
        </PillGroup>
        <Legend size={isMobile ? "touch" : "default"}>
          {runs.map((r) => {
            const label = isMobile
              ? r.run.name
              : `${r.run.name} · ${new Date(r.run.date).toLocaleDateString()}`;
            return (
              <LegendItem
                key={r.run.id}
                color={r.color}
                label={label}
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
            );
          })}
        </Legend>
      </div>
    </div>
  );
}
