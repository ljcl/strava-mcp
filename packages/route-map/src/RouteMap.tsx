import { formatTime } from "@strava-mcp/data";
import {
  type ModelContextApp,
  Pill,
  PillGroup,
  TooltipEntry,
  Tooltip as UiTooltip,
  useModelContextSync,
} from "@strava-mcp/ui";
import { type PointerEvent, useMemo, useState } from "react";
import { buildRouteMapContextSummary } from "./contextSummary";
import { buildElevationProfile, nearestXIndex } from "./elevationProfile";
import {
  buildMetricSeries,
  buildTrackSegments,
  colorForValue,
  type MetricKey,
  RAMP_GRADIENT_CSS,
} from "./metrics";
import { nearestPointIndex, projectRoute } from "./normalize";
import styles from "./RouteMap.module.css";
import { type RouteMapData } from "./types";

interface RouteMapProps {
  data: RouteMapData;
  mode?: "mobile" | "desktop";
  app?: ModelContextApp;
}

/** Frame geometry per layout. All values are SVG viewBox units. */
const DIMS = {
  desktop: {
    width: 640,
    height: 380,
    padding: 28,
    stroke: 3,
    marker: 6,
    strip: 64,
  },
  mobile: {
    width: 340,
    height: 300,
    padding: 22,
    stroke: 3.5,
    marker: 7,
    strip: 56,
  },
} as const;

/** Headroom above the elevation strip's highest point, in viewBox units. */
const STRIP_PAD_TOP = 8;

const GRID_ID = "route-map-grid";

function formatKm(metres: number): string {
  const km = metres / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

export function RouteMap({ data, mode = "desktop", app }: RouteMapProps) {
  const isMobile = mode === "mobile";
  const dims = isMobile ? DIMS.mobile : DIMS.desktop;
  const distanceKm = data.distance / 1000;

  const projected = useMemo(
    () =>
      projectRoute(data.coordinates, {
        width: dims.width,
        height: dims.height,
        padding: dims.padding,
      }),
    [data.coordinates, dims.width, dims.height, dims.padding],
  );

  const series = useMemo(() => buildMetricSeries(data), [data]);
  const [metricKey, setMetricKey] = useState<MetricKey | null>(
    () => series[0]?.key ?? null,
  );
  // Fall back to the first series if the selected metric vanishes (e.g. the
  // data refreshes without that stream), so the track stays colored.
  const activeSeries =
    series.find((s) => s.key === metricKey) ?? series[0] ?? null;

  const segments = useMemo(
    () =>
      projected && activeSeries
        ? buildTrackSegments(projected.points, activeSeries)
        : [],
    [projected, activeSeries],
  );

  const profile = useMemo(() => {
    const altitude = data.streams?.altitude;
    if (!altitude || altitude.length !== data.coordinates.length) return null;
    return buildElevationProfile(altitude, data.streams?.distance, {
      width: dims.width,
      height: dims.strip,
      padTop: STRIP_PAD_TOP,
    });
  }, [data.streams, data.coordinates.length, dims.width, dims.strip]);

  // One scrub index drives the markers on both the track and the elevation
  // strip; either surface's pointer can set it.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const canScrub = projected !== null && activeSeries !== null;

  const handleMapPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!canScrub || !projected) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * dims.width;
    const y = ((e.clientY - rect.top) / rect.height) * dims.height;
    const idx = nearestPointIndex(projected.points, x, y);
    setScrubIndex(idx >= 0 ? idx : null);
  };

  const handleStripPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!canScrub || !profile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * dims.width;
    const idx = nearestXIndex(profile.xs, x);
    setScrubIndex(idx >= 0 ? idx : null);
  };

  const clearScrub = () => setScrubIndex(null);

  useModelContextSync(
    app,
    () =>
      buildRouteMapContextSummary({
        name: data.name,
        source: data.source,
        activityType: data.activityType,
        distanceKm,
        elevationGain: data.elevationGain,
        hasGeometry: projected !== null,
        colorMetric: activeSeries?.label ?? null,
      }),
    [
      data.name,
      data.source,
      distanceKm,
      data.elevationGain,
      projected !== null,
      activeSeries?.label,
    ],
  );

  const subtitle = [
    data.activityType,
    data.source === "route" ? "Route" : "Activity",
  ]
    .filter(Boolean)
    .join(" · ");

  const scrubPoint =
    scrubIndex != null ? (projected?.points[scrubIndex] ?? null) : null;
  const scrubValue =
    scrubIndex != null && activeSeries
      ? (activeSeries.values[scrubIndex] ?? null)
      : null;

  const scrubPosition = (() => {
    if (scrubIndex == null) return undefined;
    const parts: string[] = [];
    const d = data.streams?.distance?.[scrubIndex];
    if (d != null) parts.push(`${formatKm(d)} km`);
    const t = data.streams?.time?.[scrubIndex];
    if (t != null) parts.push(formatTime(t));
    return parts.length > 0 ? parts.join(" · ") : undefined;
  })();

  return (
    <div className={styles.container} data-compact={isMobile || undefined}>
      <div className={styles.header}>
        <div className={styles.title}>{data.name}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>

      {projected ? (
        <div className={styles.mapArea}>
          <div className={styles.mapWrap}>
            <svg
              className={styles.svg}
              viewBox={`0 0 ${dims.width} ${dims.height}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Map of ${data.name}, ${formatKm(data.distance)} kilometres`}
              data-scrub={canScrub || undefined}
              onPointerMove={handleMapPointerMove}
              onPointerLeave={clearScrub}
            >
              <defs>
                <pattern
                  id={GRID_ID}
                  width={40}
                  height={40}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M40 0 L0 0 0 40"
                    fill="none"
                    stroke="var(--color-border-tertiary)"
                    strokeWidth={1}
                  />
                </pattern>
              </defs>

              <rect
                x={0}
                y={0}
                width={dims.width}
                height={dims.height}
                rx={12}
                fill="var(--color-background-secondary)"
              />
              <rect
                x={0}
                y={0}
                width={dims.width}
                height={dims.height}
                rx={12}
                fill={`url(#${GRID_ID})`}
              />

              {segments.length > 0 ? (
                segments.map((segment, i) => (
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived, static per render, and an out-and-back track can repeat an identical path string
                    key={i}
                    d={segment.path}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={dims.stroke}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))
              ) : (
                <path
                  d={projected.path}
                  fill="none"
                  stroke="var(--chart-pace)"
                  strokeWidth={dims.stroke}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {projected.start && (
                <circle
                  cx={projected.start.x}
                  cy={projected.start.y}
                  r={dims.marker}
                  fill="var(--color-text-success)"
                  stroke="var(--color-background-primary)"
                  strokeWidth={2}
                />
              )}
              {projected.end && (
                <circle
                  cx={projected.end.x}
                  cy={projected.end.y}
                  r={dims.marker}
                  fill="var(--color-text-danger)"
                  stroke="var(--color-background-primary)"
                  strokeWidth={2}
                />
              )}

              {scrubPoint && scrubValue != null && activeSeries && (
                <circle
                  cx={scrubPoint.x}
                  cy={scrubPoint.y}
                  r={dims.marker - 1}
                  fill={colorForValue(activeSeries, scrubValue)}
                  stroke="var(--color-background-primary)"
                  strokeWidth={2}
                />
              )}
            </svg>
          </div>

          {scrubPoint && scrubValue != null && activeSeries && (
            <div
              className={styles.scrubTip}
              data-flip={scrubPoint.x > dims.width * 0.55 || undefined}
              style={{
                left: `${(scrubPoint.x / dims.width) * 100}%`,
                top: `${(scrubPoint.y / dims.height) * 100}%`,
              }}
            >
              <UiTooltip timestamp={scrubPosition}>
                <TooltipEntry
                  color={colorForValue(activeSeries, scrubValue)}
                  label={activeSeries.label}
                  value={activeSeries.format(scrubValue)}
                />
              </UiTooltip>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          No GPS track is available for this {data.source}.
        </div>
      )}

      {projected && profile && (
        <svg
          className={styles.strip}
          viewBox={`0 0 ${dims.width} ${dims.strip}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Elevation profile"
          data-scrub={canScrub || undefined}
          onPointerMove={handleStripPointerMove}
          onPointerLeave={clearScrub}
        >
          <path
            d={profile.areaPath}
            fill="var(--chart-altitude)"
            fillOpacity={0.25}
          />
          <path
            d={profile.linePath}
            fill="none"
            stroke="var(--chart-altitude)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {scrubIndex != null && profile.xs[scrubIndex] != null && (
            <>
              <line
                x1={profile.xs[scrubIndex]}
                y1={0}
                x2={profile.xs[scrubIndex]}
                y2={dims.strip}
                stroke="var(--color-border-secondary)"
                strokeWidth={1}
              />
              <circle
                cx={profile.xs[scrubIndex]}
                cy={profile.ys[scrubIndex]}
                r={3.5}
                fill="var(--chart-altitude)"
                stroke="var(--color-background-primary)"
                strokeWidth={1.5}
              />
            </>
          )}
        </svg>
      )}

      {series.length > 0 && projected && (
        <div className={styles.controls}>
          {series.length > 1 && (
            <PillGroup>
              {series.map((s) => (
                <Pill
                  key={s.key}
                  active={s.key === activeSeries?.key}
                  onClick={() => setMetricKey(s.key)}
                >
                  {isMobile ? s.shortLabel : s.label}
                </Pill>
              ))}
            </PillGroup>
          )}
          {activeSeries && (
            <div className={styles.scale}>
              <span className={styles.scaleLabel}>
                {activeSeries.format(activeSeries.min)}
              </span>
              <span
                className={styles.scaleBar}
                style={{ background: RAMP_GRADIENT_CSS }}
              />
              <span className={styles.scaleLabel}>
                {activeSeries.format(activeSeries.max)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.label}>Distance</span>
            <span className={styles.value}>{formatKm(data.distance)} km</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.label}>Elevation</span>
            <span className={styles.value}>
              {Math.round(data.elevationGain)} m
            </span>
          </div>
        </div>
        {projected && (
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.dot} data-marker="start" />
              Start
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dot} data-marker="end" />
              Finish
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
