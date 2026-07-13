import {
  formatDistance,
  formatPace,
  formatTime,
  type HostLayout,
} from "@strava-mcp/data";
import { GRID_DASHARRAY, getChartTokens } from "@strava-mcp/design-system";
import {
  Legend,
  LegendItem,
  type ModelContextApp,
  Pill,
  PillGroup,
  TooltipEntry,
  Tooltip as UiTooltip,
  useModelContextSync,
} from "@strava-mcp/ui";
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
import styles from "./ActivityChart.module.css";
import { buildChartA11yDescription, buildChartA11yTitle } from "./a11y";
import { buildChartContextSummary } from "./contextSummary";
import { type ChartLap, smoothData } from "./normalize";
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

/**
 * Per-series class names for the CSS legend-hover dimming (#133): hover
 * state is applied as a `data-hovered` attribute on the chart wrapper and
 * resolved in CSS, so hovering the legend never re-renders the memoized
 * Recharts tree.
 */
const SERIES_CLASS: Record<MetricKey, string> = {
  heartrate: `${styles.series} ${styles.seriesHeartrate}`,
  power: `${styles.series} ${styles.seriesPower}`,
  pace: `${styles.series} ${styles.seriesPace}`,
  altitude: `${styles.series} ${styles.seriesAltitude}`,
  cadence: `${styles.series} ${styles.seriesCadence}`,
  grade: `${styles.series} ${styles.seriesGrade}`,
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
    <PillGroup>
      {presets.map((preset) => (
        <Pill
          key={preset.id}
          active={preset.id === activePresetId}
          onClick={() => onSelect(preset)}
        >
          {preset.label}
        </Pill>
      ))}
    </PillGroup>
  );
}

/* ── Tooltip ──────────────────────────────────────────────────── */

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: number;
  meta: ActivityMeta;
  xIsDistance?: boolean;
}

export function ChartTooltip({
  active,
  payload,
  label,
  meta,
  xIsDistance,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  // Keep zeros: 0 W (coasting), 0% grade, and cadence 0 are real readings.
  const filtered = payload.filter(
    (e): e is { name: string; value: number; color: string } => e.value != null,
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

  const timestamp = xIsDistance
    ? formatDistance(label ?? 0)
    : formatTime(label ?? 0);

  return (
    <UiTooltip timestamp={timestamp}>
      {filtered.map((entry) => (
        <TooltipEntry
          key={entry.name}
          color={entry.color}
          label={entry.name}
          value={
            entry.name === "Pace" && (meta.isRunning || meta.isSwimming)
              ? formatPace(entry.value)
              : entry.value.toFixed(1)
          }
          unit={unitMap[entry.name]}
        />
      ))}
    </UiTooltip>
  );
}

/* ── Legend items ─────────────────────────────────────────────── */

interface LegendEntry {
  key: string;
  color: string;
  label: string;
}

/* ── Main chart ───────────────────────────────────────────────── */

interface ActivityChartProps {
  data: ChartDataPoint[];
  meta: ActivityMeta;
  laps?: ChartLap[];
  layout?: HostLayout;
  mode?: "mobile" | "desktop";
  app?: ModelContextApp;
}

export function ActivityChart({
  data,
  meta,
  laps,
  layout,
  mode = "desktop",
  app,
}: ActivityChartProps) {
  const aspect = layout?.chartAspect ?? (mode === "mobile" ? 0.95 : 1.8);
  const isMobile = mode === "mobile";
  // Legacy compact flag still used by the CSS module for header/footer
  // spacing; any mobile render counts as compact.
  const isCompact = isMobile || layout?.mode === "mobile";
  const tokens = useMemo(() => {
    const chartTokens = getChartTokens(mode);
    return {
      ...chartTokens,
      // Alias for the cadence overlay; it's the secondary stroke semantically.
      cadenceStrokeWidth: chartTokens.secondaryStrokeWidth,
      // activity-chart is a hero chart and reclaims YAxis space with negative outer margin.
      chartMarginX: isMobile ? -20 : -30,
      // Slight top margin to separate the header from the chart plot area.
      chartMarginTop: isMobile ? 8 : 5,
    };
  }, [mode, isMobile]);

  // Which series have data — one memoized scan instead of six per render.
  const availableMetrics = useMemo(() => {
    const s = new Set<MetricKey>();
    for (const metric of ALL_METRICS) {
      if (data.some((d) => d[metric] !== undefined)) s.add(metric);
    }
    return s;
  }, [data]);

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
  // Mobile defaults to smoothed because the Smooth toggle is hidden there —
  // the raw traces are too noisy to read at small sizes anyway.
  const [smooth, setSmooth] = useState(isMobile);

  useModelContextSync(
    app,
    () =>
      buildChartContextSummary({
        activityName: meta.name,
        availableMetrics: [...availableMetrics],
        hidden,
        smooth,
      }),
    [meta.name, hidden, smooth, availableMetrics],
  );

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

  const legendItems: LegendEntry[] = [];
  if (availableMetrics.has("heartrate"))
    legendItems.push({
      key: "heartrate",
      color: COLORS.heartrate,
      label: "Heart Rate",
    });
  if (availableMetrics.has("power"))
    legendItems.push({ key: "power", color: COLORS.power, label: "Power" });
  if (availableMetrics.has("pace"))
    legendItems.push({
      key: "pace",
      color: COLORS.pace,
      label: meta.isRunning ? "Pace" : "Speed",
    });
  if (availableMetrics.has("altitude"))
    legendItems.push({
      key: "altitude",
      color: COLORS.altitude,
      label: "Altitude",
    });
  if (availableMetrics.has("cadence"))
    legendItems.push({
      key: "cadence",
      color: COLORS.cadence,
      label: "Cadence",
    });
  if (availableMetrics.has("grade") && !isMobile)
    legendItems.push({ key: "grade", color: COLORS.grade, label: "Grade" });

  // Screen-reader narration (#28), computed outside the chart memo so the
  // memo's dependency is the resulting string, not the smoothing flag.
  const a11yDescription = useMemo(() => {
    const drawn = (key: MetricKey) =>
      availableMetrics.has(key) &&
      !hidden.has(key) &&
      (key !== "grade" || !isMobile);
    return buildChartA11yDescription({
      meta,
      data: displayData,
      visibleMetrics: ALL_METRICS.filter(drawn),
      lapCount:
        laps?.filter(
          (lap) => !(meta.isSwimming && lap.startDistance === lap.endDistance),
        ).length ?? 0,
      smoothed: smooth,
    });
  }, [meta, displayData, availableMetrics, hidden, isMobile, laps, smooth]);

  // The Recharts tree is memoized WITHOUT the hover state: hovering the
  // legend only flips a data attribute on the wrapper div (dimming is CSS),
  // so the element below stays referentially stable and React bails out of
  // re-rendering the chart over per-second stream data (#133).
  const chart = useMemo(() => {
    const show = (key: MetricKey) =>
      availableMetrics.has(key) && !hidden.has(key);
    return (
      <ResponsiveContainer width="100%" aspect={aspect}>
        <ComposedChart
          accessibilityLayer
          title={buildChartA11yTitle(meta)}
          desc={a11yDescription}
          data={displayData}
          margin={{
            bottom: 5,
            left: tokens.chartMarginX,
            right: tokens.chartMarginX,
            top: tokens.chartMarginTop,
          }}
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
            strokeDasharray={GRID_DASHARRAY}
            stroke="var(--color-border-tertiary)"
          />
          <XAxis
            dataKey={meta.isSwimming ? "distance" : "time"}
            tickFormatter={meta.isSwimming ? formatDistance : formatTime}
            stroke="var(--color-text-tertiary)"
            fontSize={tokens.axisFont}
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
            fontSize={tokens.axisFont}
            tickCount={isMobile ? 4 : 5}
            axisLine={false}
            tickLine={false}
          />
          {/* Right Y-axis: Altitude (floor at 0 for real-world proportions) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, "auto"]}
            stroke="var(--color-text-tertiary)"
            fontSize={tokens.axisFont}
            tickCount={isMobile ? 4 : 5}
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
            content={<ChartTooltip meta={meta} xIsDistance={meta.isSwimming} />}
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
          {show("altitude") && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="altitude"
              className={SERIES_CLASS.altitude}
              fill="url(#gradAltitude)"
              stroke={COLORS.altitude}
              strokeWidth={1}
              connectNulls
              name="Altitude"
              fillOpacity={0.25}
            />
          )}

          {/* Heart rate */}
          {show("heartrate") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="heartrate"
              name="Heart Rate"
              className={SERIES_CLASS.heartrate}
              stroke={COLORS.heartrate}
              dot={false}
              strokeWidth={tokens.strokeWidth}
              connectNulls
            />
          )}

          {/* Power */}
          {show("power") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="power"
              name="Power"
              className={SERIES_CLASS.power}
              stroke={COLORS.power}
              dot={false}
              strokeWidth={tokens.strokeWidth}
              connectNulls
            />
          )}

          {/* Pace / Speed */}
          {show("pace") && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              name="Pace"
              className={SERIES_CLASS.pace}
              stroke={COLORS.pace}
              dot={false}
              strokeWidth={tokens.strokeWidth}
              connectNulls
            />
          )}

          {/* Cadence */}
          {show("cadence") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cadence"
              name="Cadence"
              className={SERIES_CLASS.cadence}
              stroke={COLORS.cadence}
              dot={false}
              strokeWidth={tokens.cadenceStrokeWidth}
              connectNulls
            />
          )}

          {/* Grade — hidden on mobile because it crowds the altitude
              axis and its info value is low at a glance */}
          {!isMobile && show("grade") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="grade"
              name="Grade"
              className={SERIES_CLASS.grade}
              stroke={COLORS.grade}
              dot={false}
              strokeWidth={1}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }, [
    aspect,
    displayData,
    tokens,
    meta,
    laps,
    isMobile,
    availableMetrics,
    hidden,
    a11yDescription,
  ]);

  return (
    <div className={styles.activityChart} data-compact={isCompact || undefined}>
      <div className={styles.header}>
        <div className={styles.title}>{meta.name}</div>
        <div className={styles.subtitle}>{meta.activityType}</div>
      </div>

      <div
        className={styles.chartArea}
        data-hovered={hoveredLegendKey ?? undefined}
      >
        {chart}
      </div>

      {/* Footer: presets + smooth (left) | legend (right) */}
      <div className={styles.footer}>
        <div className={styles.footerControls}>
          <PresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSelect={handlePresetSelect}
          />
          {/* Smooth toggle only on desktop — mobile defaults to smoothed
              and hides the control to save footer width */}
          {!isMobile && (
            <PillGroup>
              <Pill active={smooth} onClick={() => setSmooth((s) => !s)}>
                Smooth
              </Pill>
            </PillGroup>
          )}
        </div>
        <Legend size={tokens.legendSize}>
          {legendItems.map(({ key, color, label }) => (
            <LegendItem
              key={key}
              color={color}
              label={label}
              hidden={hidden.has(key)}
              onClick={() => toggle(key)}
              onMouseEnter={() => setHoveredLegendKey(key)}
              onMouseLeave={() => setHoveredLegendKey(null)}
            />
          ))}
        </Legend>
      </div>
    </div>
  );
}
