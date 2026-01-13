import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartLap,
  formatDistance,
  formatPace,
  formatTime,
  smoothData,
} from "./normalize";
import {
  type ActivityMeta,
  type ChartDataPoint,
  type MetricKey,
} from "./types";

const COLORS = {
  altitude: "var(--chart-altitude)",
  cadence: "var(--chart-cadence)",
  grade: "var(--chart-grade)",
  heartrate: "var(--chart-heartrate)",
  pace: "var(--chart-pace)",
  power: "var(--chart-power)",
};

const ALL_METRICS: MetricKey[] = [
  "heartrate",
  "power",
  "pace",
  "altitude",
  "cadence",
  "grade",
];

/* ── Preset system ────────────────────────────────────────────── */

interface ViewPreset {
  id: string;
  label: string;
  metrics: MetricKey[];
  /** All of these must be available for the preset to show */
  requires: MetricKey[];
}

const RUNNING_PRESETS: ViewPreset[] = [
  {
    id: "effort",
    label: "Effort",
    metrics: ["heartrate", "pace", "altitude"],
    requires: ["heartrate"],
  },
  {
    id: "power",
    label: "Power",
    metrics: ["power", "pace", "altitude"],
    requires: ["power"],
  },
  {
    id: "form",
    label: "Form",
    metrics: ["cadence", "pace", "heartrate"],
    requires: ["cadence"],
  },
  {
    id: "terrain",
    label: "Terrain",
    metrics: ["altitude", "grade", "pace"],
    requires: ["altitude", "grade"],
  },
  { id: "all", label: "All", metrics: ALL_METRICS, requires: [] },
];

const CYCLING_PRESETS: ViewPreset[] = [
  {
    id: "effort",
    label: "Effort",
    metrics: ["power", "heartrate", "altitude"],
    requires: ["heartrate"],
  },
  {
    id: "speed",
    label: "Speed",
    metrics: ["pace", "heartrate", "altitude"],
    requires: ["pace"],
  },
  {
    id: "form",
    label: "Form",
    metrics: ["cadence", "power", "heartrate"],
    requires: ["cadence"],
  },
  {
    id: "terrain",
    label: "Terrain",
    metrics: ["altitude", "grade", "pace"],
    requires: ["altitude", "grade"],
  },
  { id: "all", label: "All", metrics: ALL_METRICS, requires: [] },
];

const SWIMMING_PRESETS: ViewPreset[] = [
  {
    id: "effort",
    label: "Effort",
    metrics: ["heartrate", "pace"],
    requires: ["heartrate"],
  },
  { id: "all", label: "All", metrics: ALL_METRICS, requires: [] },
];

function getAvailablePresets(
  meta: ActivityMeta,
  availableMetrics: Set<MetricKey>,
): ViewPreset[] {
  const base = meta.isRunning
    ? RUNNING_PRESETS
    : meta.isSwimming
      ? SWIMMING_PRESETS
      : CYCLING_PRESETS;
  return base.filter((p) => p.requires.every((k) => availableMetrics.has(k)));
}

function computeHiddenSet(
  preset: ViewPreset,
  availableMetrics: Set<MetricKey>,
): Set<string> {
  const hidden = new Set<string>();
  for (const key of availableMetrics) {
    if (!preset.metrics.includes(key)) hidden.add(key);
  }
  return hidden;
}

function seriesOpacity(key: string, hoveredKey: string | null): number {
  if (!hoveredKey || key === hoveredKey) return 1;
  return 0.15;
}

/* ── Pill-group button ─────────────────────────────────────────── */

const PILL_BASE: React.CSSProperties = {
  background: "none",
  border: "none",
  borderRadius: "999px",
  color: "var(--color-text-tertiary)",
  cursor: "pointer",
  font: "inherit",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-text-xs-size)",
  fontWeight: "var(--font-weight-medium)" as unknown as number,
  lineHeight: 1,
  padding: "6px 14px",
  userSelect: "none" as const,
  whiteSpace: "nowrap" as const,
};

const PILL_ACTIVE: React.CSSProperties = {
  background: "var(--color-background-primary)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
  color: "var(--color-text-primary)",
  fontWeight: "var(--font-weight-semibold)" as unknown as number,
};

const PILL_GROUP: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  borderRadius: "999px",
  display: "inline-flex",
  gap: "2px",
  padding: "3px",
};

/* ── PresetSelector component ─────────────────────────────────── */

interface PresetSelectorProps {
  presets: ViewPreset[];
  activePresetId: string | null;
  onSelect: (preset: ViewPreset) => void;
}

function PresetSelector({
  presets,
  activePresetId,
  onSelect,
}: PresetSelectorProps) {
  if (presets.length <= 1) return null;
  return (
    <div style={PILL_GROUP}>
      {presets.map((preset) => {
        const isActive = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            style={{
              ...PILL_BASE,
              ...(isActive ? PILL_ACTIVE : undefined),
            }}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Tooltip ──────────────────────────────────────────────────── */

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
  meta: ActivityMeta;
  xIsDistance?: boolean;
}

function CustomTooltip({
  active,
  payload,
  label,
  meta,
  xIsDistance,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(
    (e) => !e.name.includes("Area") && e.value !== 0,
  );
  if (!filtered.length) return null;

  const paceUnit = meta.isRunning
    ? "min/km"
    : meta.isSwimming
      ? "/100m"
      : "km/h";

  const unitMap: Record<string, string> = {
    Altitude: "m",
    Cadence: meta.isRunning ? "spm" : "rpm",
    Grade: "%",
    "Heart Rate": "bpm",
    Pace: paceUnit,
    Power: "W",
  };

  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        fontSize: "var(--font-text-sm-size)",
        minWidth: 120,
        padding: "10px 14px",
      }}
    >
      {filtered.map((entry) => (
        <div
          key={entry.name}
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            lineHeight: 1.8,
          }}
        >
          <div
            style={{
              backgroundColor: entry.color,
              borderRadius: 2,
              flexShrink: 0,
              height: 3,
              width: 16,
            }}
          />
          <span style={{ color: "var(--color-text-primary)" }}>
            <span style={{ fontWeight: "var(--font-weight-semibold)" }}>
              {entry.name === "Pace" && (meta.isRunning || meta.isSwimming)
                ? formatPace(entry.value)
                : entry.value.toFixed(1)}
            </span>{" "}
            <span style={{ color: "var(--color-text-tertiary)" }}>
              {unitMap[entry.name] ?? ""} {entry.name}
            </span>
          </span>
        </div>
      ))}
      <div
        style={{
          color: "var(--color-text-tertiary)",
          fontSize: "var(--font-text-xs-size)",
          marginTop: "4px",
        }}
      >
        {xIsDistance ? formatDistance(label ?? 0) : formatTime(label ?? 0)}
      </div>
    </div>
  );
}

/* ── Legend ────────────────────────────────────────────────────── */

interface LegendItem {
  key: string;
  color: string;
  label: string;
}

interface CustomLegendProps {
  items: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onHover: (key: string) => void;
  onHoverEnd: () => void;
}

function CustomLegend({
  items,
  hidden,
  onToggle,
  onHover,
  onHoverEnd,
}: CustomLegendProps) {
  return (
    <div
      style={{
        alignItems: "center",
        color: "var(--color-text-secondary)",
        display: "flex",
        flexWrap: "wrap",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--font-text-xs-size)",
        gap: "14px",
      }}
    >
      {items.map(({ key, color, label }) => {
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            onMouseEnter={() => onHover(key)}
            onMouseLeave={onHoverEnd}
            style={{
              alignItems: "center",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              display: "flex",
              font: "inherit",
              gap: "4px",
              opacity: isHidden ? 0.3 : 1,
              padding: 0,
              textDecoration: isHidden ? "line-through" : "none",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                backgroundColor: color,
                borderRadius: 2,
                flexShrink: 0,
                height: 3,
                width: 16,
              }}
            />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Main chart ───────────────────────────────────────────────── */

interface ActivityChartProps {
  data: ChartDataPoint[];
  meta: ActivityMeta;
  laps?: ChartLap[];
}

export function ActivityChart({ data, meta, laps }: ActivityChartProps) {
  // Determine which series have data
  const hasHeartrate = data.some((d) => d.heartrate !== undefined);
  const hasPower = data.some((d) => d.power !== undefined);
  const hasPace = data.some((d) => d.pace !== undefined);
  const hasAltitude = data.some((d) => d.altitude !== undefined);
  const hasCadence = data.some((d) => d.cadence !== undefined);
  const hasGrade = data.some((d) => d.grade !== undefined);

  const availableMetrics = useMemo(() => {
    const s = new Set<MetricKey>();
    if (hasHeartrate) s.add("heartrate");
    if (hasPower) s.add("power");
    if (hasPace) s.add("pace");
    if (hasAltitude) s.add("altitude");
    if (hasCadence) s.add("cadence");
    if (hasGrade) s.add("grade");
    return s;
  }, [hasHeartrate, hasPower, hasPace, hasAltitude, hasCadence, hasGrade]);

  const presets = useMemo(
    () => getAvailablePresets(meta, availableMetrics),
    [meta, availableMetrics],
  );

  // Initialize hidden from the default "Effort" preset
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const defaultPreset = presets.find((p) => p.id === "effort") ?? presets[0];
    return defaultPreset
      ? computeHiddenSet(defaultPreset, availableMetrics)
      : new Set();
  });

  const [hoveredLegendKey, setHoveredLegendKey] = useState<string | null>(null);
  const [smooth, setSmooth] = useState(false);

  const displayData = useMemo(
    () => (smooth ? smoothData(data) : data),
    [data, smooth],
  );

  // Derive active preset by matching current hidden state
  const activePresetId = useMemo(() => {
    for (const preset of presets) {
      const presetHidden = computeHiddenSet(preset, availableMetrics);
      if (
        presetHidden.size === hidden.size &&
        [...presetHidden].every((k) => hidden.has(k))
      ) {
        return preset.id;
      }
    }
    return null;
  }, [presets, hidden, availableMetrics]);

  const handlePresetSelect = (preset: ViewPreset) => {
    setHidden(computeHiddenSet(preset, availableMetrics));
  };

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const show = (key: string) => !hidden.has(key);

  const legendItems: LegendItem[] = [];
  if (hasHeartrate)
    legendItems.push({
      key: "heartrate",
      color: COLORS.heartrate,
      label: "Heart Rate",
    });
  if (hasPower)
    legendItems.push({ key: "power", color: COLORS.power, label: "Power" });
  if (hasPace)
    legendItems.push({
      key: "pace",
      color: COLORS.pace,
      label: meta.isRunning ? "Pace" : "Speed",
    });
  if (hasAltitude)
    legendItems.push({
      key: "altitude",
      color: COLORS.altitude,
      label: "Altitude",
    });
  if (hasCadence)
    legendItems.push({
      key: "cadence",
      color: COLORS.cadence,
      label: "Cadence",
    });
  if (hasGrade)
    legendItems.push({ key: "grade", color: COLORS.grade, label: "Grade" });

  return (
    <div style={{ padding: "0" }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          marginBottom: "8px",
          padding: "0 8px",
        }}
      >
        <div
          style={{
            color: "var(--color-text-primary)",
            fontSize: "var(--font-heading-sm-size)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {meta.name}
        </div>
        <div
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-text-sm-size)",
          }}
        >
          {meta.activityType}
        </div>
      </div>

      <ResponsiveContainer width="100%" aspect={1.8}>
        <ComposedChart
          data={displayData}
          margin={{ bottom: 5, left: -30, right: -30, top: 5 }}
        >
          <defs>
            <linearGradient id="gradAltitude" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.altitude} stopOpacity={0.2} />
              <stop
                offset="100%"
                stopColor={COLORS.altitude}
                stopOpacity={0.03}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            horizontal={true}
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--color-border-tertiary)"
          />
          <XAxis
            dataKey={meta.isSwimming ? "distance" : "time"}
            tickFormatter={meta.isSwimming ? formatDistance : formatTime}
            stroke="var(--color-text-tertiary)"
            fontSize={13}
            interval="preserveStartEnd"
            minTickGap={40}
            axisLine={false}
            tickLine={false}
          />
          {/* Left Y-axis: HR / Power / Cadence */}
          <YAxis
            yAxisId="left"
            domain={["auto", "auto"]}
            stroke="var(--color-text-tertiary)"
            fontSize={13}
            tickCount={5}
            axisLine={false}
            tickLine={false}
          />
          {/* Right Y-axis: Altitude (floor at 0 for real-world proportions) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, "auto"]}
            stroke="var(--color-text-tertiary)"
            fontSize={13}
            tickCount={5}
            axisLine={false}
            tickLine={false}
          />
          {/* Hidden Y-axis for pace/speed — independent scaling */}
          <YAxis
            yAxisId="pace"
            hide
            domain={["auto", "auto"]}
            reversed={meta.isRunning || meta.isSwimming}
          />
          <Tooltip
            content={
              <CustomTooltip meta={meta} xIsDistance={meta.isSwimming} />
            }
            isAnimationActive={false}
            allowEscapeViewBox={{ x: false, y: false }}
            wrapperStyle={{ pointerEvents: "none", zIndex: 10 }}
          />
          {/* Lap bands */}
          {laps
            ?.filter((lap) => {
              // Skip zero-width laps on distance axis (e.g. swim rest at the wall)
              if (meta.isSwimming && lap.startDistance === lap.endDistance)
                return false;
              return true;
            })
            .map((lap, i, filteredLaps) => {
              // Compute axis range to determine if lap is wide enough for a label
              const getStart = (l: ChartLap) =>
                meta.isSwimming ? l.startDistance : l.startTime;
              const getEnd = (l: ChartLap) =>
                meta.isSwimming ? l.endDistance : l.endTime;
              const minAxis = getStart(filteredLaps[0]!);
              const maxAxis = getEnd(filteredLaps[filteredLaps.length - 1]!);
              const totalRange = maxAxis - minAxis;
              const lapWidth = getEnd(lap) - getStart(lap);
              const fraction = totalRange > 0 ? lapWidth / totalRange : 1;
              const label = fraction >= 0.05 ? lap.name : "";

              return (
                <ReferenceArea
                  key={`lap-${lap.name}-${getStart(lap)}`}
                  yAxisId="left"
                  x1={getStart(lap)}
                  x2={getEnd(lap)}
                  fill={
                    lap.isRest
                      ? "var(--color-border-tertiary)"
                      : i % 2 === 0
                        ? "var(--chart-pace)"
                        : "transparent"
                  }
                  fillOpacity={lap.isRest ? 0.3 : 0.06}
                  stroke="none"
                  label={{
                    value: label,
                    position: "insideTopLeft",
                    style: {
                      fontSize: 10,
                      fill: "var(--color-text-tertiary)",
                      fontFamily: "var(--font-sans)",
                    },
                  }}
                />
              );
            })}

          {/* Altitude area fill */}
          {hasAltitude && show("altitude") && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="altitude"
              fill="url(#gradAltitude)"
              stroke={COLORS.altitude}
              strokeWidth={1}
              connectNulls
              name="Altitude"
              strokeOpacity={seriesOpacity("altitude", hoveredLegendKey)}
              fillOpacity={seriesOpacity("altitude", hoveredLegendKey) * 0.25}
            />
          )}

          {/* Heart rate */}
          {hasHeartrate && show("heartrate") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="heartrate"
              name="Heart Rate"
              stroke={COLORS.heartrate}
              dot={false}
              strokeWidth={2}
              connectNulls
              strokeOpacity={seriesOpacity("heartrate", hoveredLegendKey)}
            />
          )}

          {/* Power */}
          {hasPower && show("power") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="power"
              name="Power"
              stroke={COLORS.power}
              dot={false}
              strokeWidth={2}
              connectNulls
              strokeOpacity={seriesOpacity("power", hoveredLegendKey)}
            />
          )}

          {/* Pace / Speed */}
          {hasPace && show("pace") && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              name="Pace"
              stroke={COLORS.pace}
              dot={false}
              strokeWidth={2}
              connectNulls
              strokeOpacity={seriesOpacity("pace", hoveredLegendKey)}
            />
          )}

          {/* Cadence */}
          {hasCadence && show("cadence") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cadence"
              name="Cadence"
              stroke={COLORS.cadence}
              dot={false}
              strokeWidth={1.5}
              connectNulls
              strokeOpacity={seriesOpacity("cadence", hoveredLegendKey)}
            />
          )}

          {/* Grade */}
          {hasGrade && show("grade") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="grade"
              name="Grade"
              stroke={COLORS.grade}
              dot={false}
              strokeWidth={1}
              connectNulls
              strokeOpacity={seriesOpacity("grade", hoveredLegendKey)}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Footer: presets + smooth (left) | legend (right) */}
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
          marginTop: "8px",
          padding: "0 8px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
          <PresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSelect={handlePresetSelect}
          />
          <div style={PILL_GROUP}>
            <button
              type="button"
              onClick={() => setSmooth((s) => !s)}
              style={{
                ...PILL_BASE,
                ...(smooth ? PILL_ACTIVE : undefined),
              }}
            >
              Smooth
            </button>
          </div>
        </div>
        <CustomLegend
          items={legendItems}
          hidden={hidden}
          onToggle={toggle}
          onHover={setHoveredLegendKey}
          onHoverEnd={() => setHoveredLegendKey(null)}
        />
      </div>
    </div>
  );
}
