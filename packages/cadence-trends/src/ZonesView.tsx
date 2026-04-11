import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { computeZoneStats } from "./normalize";
import styles from "./ScatterView.module.css";
import { type RunSummary } from "./types";

interface ZonesViewProps {
  activities: RunSummary[];
}

const ZONE_OPACITIES = [1, 0.8, 0.6, 0.4];

export function ZonesView({ activities }: ZonesViewProps) {
  const zoneStats = useMemo(() => computeZoneStats(activities), [activities]);

  const chartData = useMemo(
    () =>
      zoneStats
        .filter((z) => z.count > 0)
        .map((z) => ({
          zone: z.zone.label,
          mean: z.mean,
          min: z.min,
          max: z.max,
          count: z.count,
          errorLow: z.mean - z.min,
          errorHigh: z.max - z.mean,
        })),
    [zoneStats],
  );

  if (chartData.length === 0) {
    return (
      <div style={{ height: 320 }}>
        No runs with cadence data in this period.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border-tertiary)"
            vertical={false}
          />
          <XAxis
            dataKey="zone"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border-secondary)" }}
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
          <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell
                key={chartData[i]!.zone}
                fill="var(--chart-cadence)"
                fillOpacity={ZONE_OPACITIES[i] ?? 0.4}
              />
            ))}
            <ErrorBar
              dataKey="errorHigh"
              direction="y"
              width={8}
              stroke="var(--color-text-tertiary)"
              strokeWidth={1.5}
            />
            <LabelList
              dataKey="count"
              position="top"
              formatter={(v: string | number | boolean | null | undefined) =>
                `n=${v}`
              }
              style={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
