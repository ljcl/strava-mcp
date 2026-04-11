import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { dotSize, rollingAverage } from "./normalize";
import { SharedTooltip } from "./SharedTooltip";
import styles from "./TrendView.module.css";
import { type RunSummary } from "./types";

interface TrendViewProps {
  activities: RunSummary[];
  onRunClick: (runId: number) => void;
  selectedRunIds: Set<number>;
}

export function TrendView({
  activities,
  onRunClick,
  selectedRunIds,
}: TrendViewProps) {
  const sorted = useMemo(
    () =>
      [...activities]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .filter((a) => a.averageCadence > 0),
    [activities],
  );

  const maxDistance = useMemo(
    () => Math.max(...sorted.map((a) => a.distance), 1),
    [sorted],
  );

  const trend = useMemo(() => rollingAverage(sorted, 5), [sorted]);

  const chartData = useMemo(
    () =>
      sorted.map((a, i) => ({
        ...a,
        dateFormatted: new Date(a.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        dateTs: new Date(a.date).getTime(),
        trendCadence: trend[i]?.cadence ?? null,
        size: dotSize(a.distance, maxDistance),
      })),
    [sorted, trend, maxDistance],
  );

  if (chartData.length === 0) {
    return (
      <div className={styles.container}>
        No runs with cadence data in this period.
      </div>
    );
  }

  return (
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
            dataKey="dateFormatted"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border-secondary)" }}
          />
          <YAxis
            yAxisId="cadence"
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
          <YAxis
            yAxisId="pace"
            orientation="right"
            reversed
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "min/km",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 11, fill: "var(--color-text-tertiary)" },
            }}
          />
          <RechartsTooltip content={<SharedTooltip />} />
          <Line
            yAxisId="cadence"
            type="monotone"
            dataKey="trendCadence"
            stroke="var(--chart-cadence)"
            strokeWidth={2}
            dot={false}
            connectNulls
            strokeOpacity={0.5}
          />
          <Scatter
            yAxisId="cadence"
            dataKey="averageCadence"
            fill="var(--chart-cadence)"
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
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
          <Scatter
            yAxisId="pace"
            dataKey="averagePace"
            fill="var(--chart-pace)"
            fillOpacity={0.5}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                cursor="pointer"
                r={Math.max(entry.size / 2 - 1, 2)}
                onClick={() => onRunClick(entry.id)}
              />
            ))}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
