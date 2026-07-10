import { formatPace } from "@strava-mcp/data";
import { GRID_DASHARRAY, getChartTokens } from "@strava-mcp/design-system";
import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./chartView.module.css";
import { dotSize, linearRegression } from "./normalize";
import { SharedTooltip } from "./SharedTooltip";
import { type RunSummary } from "./types";

interface ScatterViewProps {
  activities: RunSummary[];
  onRunClick: (runId: number) => void;
  selectedRunIds: Set<number>;
  mode?: "mobile" | "desktop";
}

export function ScatterView({
  activities,
  onRunClick,
  selectedRunIds,
  mode = "desktop",
}: ScatterViewProps) {
  const isMobile = mode === "mobile";
  const tokens = {
    ...getChartTokens(mode),
    marginRight: isMobile ? 8 : 16,
    marginLeft: isMobile ? -8 : 0,
    marginBottom: 24,
  };

  const runs = useMemo(
    () => activities.filter((a) => a.averageCadence > 0 && a.averagePace > 0),
    [activities],
  );

  const maxDistance = useMemo(
    () => Math.max(...runs.map((a) => a.distance), 1),
    [runs],
  );

  const now = Date.now();
  const oldestTs = useMemo(
    () => Math.min(...runs.map((a) => new Date(a.date).getTime()), now),
    [runs, now],
  );
  const timeRange = now - oldestTs;

  const chartData = useMemo(
    () =>
      runs.map((a) => {
        const age = now - new Date(a.date).getTime();
        const recency = timeRange > 0 ? 1 - age / timeRange : 1;
        return {
          ...a,
          opacity: 0.3 + recency * 0.7,
          size: dotSize(a.distance, maxDistance) * tokens.dotScale,
        };
      }),
    [runs, maxDistance, now, timeRange, tokens.dotScale],
  );

  const regression = useMemo(() => {
    const points = runs.map((a) => ({ x: a.averagePace, y: a.averageCadence }));
    return linearRegression(points);
  }, [runs]);

  if (chartData.length === 0) {
    return (
      <div style={{ height: 320 }}>
        No runs with cadence data in this period.
      </div>
    );
  }

  const paceExtent = [
    Math.min(...runs.map((a) => a.averagePace)),
    Math.max(...runs.map((a) => a.averagePace)),
  ];

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
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
            dataKey="averagePace"
            type="number"
            reversed
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => formatPace(v)}
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
                    value: "Pace (min/km) \u2192 faster",
                    position: "insideBottom",
                    offset: -4,
                    style: {
                      fontSize: 11,
                      fill: "var(--color-text-tertiary)",
                    },
                  }
            }
          />
          <YAxis
            dataKey="averageCadence"
            type="number"
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
          <RechartsTooltip content={<SharedTooltip />} />
          {regression && (
            <ReferenceLine
              segment={[
                {
                  x: paceExtent[0],
                  y: regression.slope * paceExtent[0]! + regression.intercept,
                },
                {
                  x: paceExtent[1],
                  y: regression.slope * paceExtent[1]! + regression.intercept,
                },
              ]}
              stroke="var(--color-text-tertiary)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
            />
          )}
          <Scatter data={chartData} fill="var(--chart-cadence)">
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
                fillOpacity={entry.opacity}
                r={entry.size / 2}
                stroke={
                  selectedRunIds.has(entry.id)
                    ? "var(--color-text-primary)"
                    : "none"
                }
                strokeWidth={selectedRunIds.has(entry.id) ? 2 : 0}
                onClick={() => onRunClick(entry.id)}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
