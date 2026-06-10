import { formatTime } from "@strava-mcp/data";
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
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPhotoMarkers,
  buildSplitMarkers,
  type SplitMarker,
} from "./annotations";
import { buildRouteMapContextSummary } from "./contextSummary";
import { buildElevationProfile, nearestXIndex } from "./elevationProfile";
import {
  buildMetricSeries,
  buildTrackSegments,
  colorForValue,
  type MetricKey,
  RAMP_GRADIENT_CSS,
} from "./metrics";
import { nearestPointIndex, type Point, projectRoute } from "./normalize";
import { isZoomed, panViewBox, type ViewBox, zoomViewBox } from "./panZoom";
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

/** Wheel-step zoom factor. */
const WHEEL_ZOOM_FACTOR = 1.2;

const GRID_ID = "route-map-grid";

type LayerKey = "splits" | "segments" | "photos";

const LAYER_COLORS: Record<LayerKey, string> = {
  splits: "var(--color-text-info)",
  segments: "var(--chart-power)",
  photos: "var(--chart-cadence)",
};

function segmentHaloColor(segment: { isPr: boolean; isTop10: boolean }) {
  // Fixed golds/purples (not theme vars): they flag achievement tiers and
  // need to read identically against the multi-hue metric track.
  if (segment.isPr) return "#f59e0b";
  if (segment.isTop10) return "#a78bfa";
  return LAYER_COLORS.segments;
}

function formatKm(metres: number): string {
  const km = metres / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

function pathThrough(points: Point[]): string {
  return points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`,
    )
    .join(" ");
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

  /* ── Annotation layers ───────────────────────────────────────── */

  const splitMarkers = useMemo(() => buildSplitMarkers(data), [data]);
  const photoMarkers = useMemo(() => buildPhotoMarkers(data), [data]);
  const segmentSpans = useMemo(() => {
    if (!projected) return [];
    const efforts = data.annotations?.segments ?? [];
    return efforts.flatMap((segment) => {
      const points = projected.points.slice(
        segment.startIndex,
        segment.endIndex + 1,
      );
      if (points.length < 2) return [];
      return [{ ...segment, path: pathThrough(points) }];
    });
  }, [projected, data.annotations?.segments]);

  const layers = useMemo(() => {
    const out: Array<{ key: LayerKey; label: string }> = [];
    if (splitMarkers.length > 0) {
      out.push({
        key: "splits",
        label: data.annotations?.laps?.length ? "Laps" : "Splits",
      });
    }
    if (segmentSpans.length > 0)
      out.push({ key: "segments", label: "Segments" });
    if (photoMarkers.length > 0) out.push({ key: "photos", label: "Photos" });
    return out;
  }, [splitMarkers, segmentSpans, photoMarkers, data.annotations?.laps]);

  const [hiddenLayers, setHiddenLayers] = useState<Set<LayerKey>>(new Set());
  const layerVisible = (key: LayerKey) => !hiddenLayers.has(key);
  const toggleLayer = (key: LayerKey) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ── Zoom / pan ──────────────────────────────────────────────── */

  const base = useMemo<ViewBox>(
    () => ({ x: 0, y: 0, w: dims.width, h: dims.height }),
    [dims.width, dims.height],
  );
  const [view, setView] = useState<ViewBox>(base);
  useEffect(() => setView(base), [base]);
  // Handlers registered outside React (wheel) and gesture branches read the
  // live view through a ref to avoid re-binding per frame.
  const viewRef = useRef(view);
  viewRef.current = view;

  const zoomed = isZoomed(view, base);
  /** Screen-constant sizing: marker/stroke sizes shrink with the viewport. */
  const k = view.w / base.w;

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Active pointers by id, in client coordinates (pan/pinch tracking). */
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const canZoom = projected !== null;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !canZoom) return;
    const onWheel = (e: WheelEvent) => {
      const zoomingOut = e.deltaY > 0;
      // Fully zoomed out: let the page scroll instead of trapping the wheel.
      if (zoomingOut && !isZoomed(viewRef.current, base)) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const factor = zoomingOut ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR;
      setView((v) => {
        const cx = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
        const cy = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
        return zoomViewBox(v, base, factor, cx, cy);
      });
    };
    // React's onWheel can't preventDefault (passive); bind directly.
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [canZoom, base]);

  /* ── Scrub ───────────────────────────────────────────────────── */

  // One scrub index drives the markers on both the track and the elevation
  // strip; either surface's pointer can set it.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const canScrub = projected !== null && activeSeries !== null;

  const scrubAt = (clientX: number, clientY: number, rect: DOMRect) => {
    if (!canScrub || !projected) return;
    const v = viewRef.current;
    const x = v.x + ((clientX - rect.left) / rect.width) * v.w;
    const y = v.y + ((clientY - rect.top) / rect.height) * v.h;
    const idx = nearestPointIndex(projected.points, x, y);
    setScrubIndex(idx >= 0 ? idx : null);
  };

  /* ── Map pointer gestures ────────────────────────────────────── */

  const handleMapPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!canZoom) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const handleMapPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const tracked = pointers.current.get(e.pointerId);

    if (tracked && pointers.current.size === 2) {
      // Pinch: zoom by the finger-distance ratio around the midpoint, then
      // pan by the midpoint's movement.
      const other = [...pointers.current.entries()].find(
        ([id]) => id !== e.pointerId,
      )?.[1];
      if (!other) return;
      const prevDist = Math.hypot(tracked.x - other.x, tracked.y - other.y);
      const currDist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const prevMid = {
        x: (tracked.x + other.x) / 2,
        y: (tracked.y + other.y) / 2,
      };
      const currMid = {
        x: (e.clientX + other.x) / 2,
        y: (e.clientY + other.y) / 2,
      };
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setScrubIndex(null);
      setView((v) => {
        const cx = v.x + ((currMid.x - rect.left) / rect.width) * v.w;
        const cy = v.y + ((currMid.y - rect.top) / rect.height) * v.h;
        const scaled =
          prevDist > 0 ? zoomViewBox(v, base, currDist / prevDist, cx, cy) : v;
        return panViewBox(
          scaled,
          base,
          (-(currMid.x - prevMid.x) / rect.width) * scaled.w,
          (-(currMid.y - prevMid.y) / rect.height) * scaled.h,
        );
      });
      return;
    }

    if (tracked && pointers.current.size === 1) {
      const dragPans =
        e.pointerType !== "touch" || isZoomed(viewRef.current, base);
      if (dragPans) {
        const dx = e.clientX - tracked.x;
        const dy = e.clientY - tracked.y;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (isZoomed(viewRef.current, base)) {
          setScrubIndex(null);
          setView((v) =>
            panViewBox(
              v,
              base,
              (-dx / rect.width) * v.w,
              (-dy / rect.height) * v.h,
            ),
          );
          return;
        }
        // Mouse drag at base zoom has nothing to pan; fall through to scrub.
      }
      // Touch drag at base zoom scrubs (and the browser still owns vertical
      // scrolling via touch-action: pan-y).
    }

    scrubAt(e.clientX, e.clientY, rect);
  };

  const handleMapPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const clearScrub = (e: PointerEvent<SVGSVGElement>) => {
    handleMapPointerEnd(e);
    setScrubIndex(null);
  };

  const handleStripPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!canScrub || !profile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * dims.width;
    const idx = nearestXIndex(profile.xs, x);
    setScrubIndex(idx >= 0 ? idx : null);
  };

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
  // Tooltip anchor as a fraction of the current viewport; hidden when the
  // scrubbed point is panned/zoomed out of view.
  const scrubFraction = scrubPoint
    ? {
        x: (scrubPoint.x - view.x) / view.w,
        y: (scrubPoint.y - view.y) / view.h,
      }
    : null;
  const scrubInView =
    scrubFraction !== null &&
    scrubFraction.x >= 0 &&
    scrubFraction.x <= 1 &&
    scrubFraction.y >= 0 &&
    scrubFraction.y <= 1;

  const scrubPosition = (() => {
    if (scrubIndex == null) return undefined;
    const parts: string[] = [];
    const d = data.streams?.distance?.[scrubIndex];
    if (d != null) parts.push(`${formatKm(d)} km`);
    const t = data.streams?.time?.[scrubIndex];
    if (t != null) parts.push(formatTime(t));
    return parts.length > 0 ? parts.join(" · ") : undefined;
  })();

  const markerAt = (index: number): Point | null =>
    projected?.points[index] ?? null;

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
              ref={svgRef}
              className={styles.svg}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Map of ${data.name}, ${formatKm(data.distance)} kilometres`}
              data-zoomed={zoomed || undefined}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={handleMapPointerEnd}
              onPointerCancel={handleMapPointerEnd}
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

              {/* Segment-effort halos sit under the track as wide outlines. */}
              {layerVisible("segments") &&
                segmentSpans.map((segment) => (
                  <path
                    key={`${segment.name}-${segment.startIndex}`}
                    d={segment.path}
                    fill="none"
                    stroke={segmentHaloColor(segment)}
                    strokeOpacity={0.45}
                    strokeWidth={dims.stroke * 2.8 * k}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  >
                    <title>
                      {segment.name}
                      {segment.isPr
                        ? " · PR"
                        : segment.isTop10
                          ? " · Top 10"
                          : ""}
                    </title>
                  </path>
                ))}

              {segments.length > 0 ? (
                segments.map((segment, i) => (
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived, static per render, and an out-and-back track can repeat an identical path string
                    key={i}
                    d={segment.path}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={dims.stroke * k}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))
              ) : (
                <path
                  d={projected.path}
                  fill="none"
                  stroke="var(--chart-pace)"
                  strokeWidth={dims.stroke * k}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Lap / km split dots. */}
              {layerVisible("splits") &&
                splitMarkers.map((split: SplitMarker) => {
                  const p = markerAt(split.index);
                  if (!p) return null;
                  return (
                    <circle
                      key={`split-${split.index}`}
                      cx={p.x}
                      cy={p.y}
                      r={dims.marker * 0.65 * k}
                      fill="var(--color-background-primary)"
                      stroke={LAYER_COLORS.splits}
                      strokeWidth={2 * k}
                    >
                      <title>{split.label}</title>
                    </circle>
                  );
                })}

              {/* Photo pins. */}
              {layerVisible("photos") &&
                photoMarkers.map((photo) => {
                  const p = markerAt(photo.index);
                  if (!p) return null;
                  const title = [
                    photo.count === 1 ? "1 photo" : `${photo.count} photos`,
                    photo.caption,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <g key={`photo-${photo.index}`}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={dims.marker * 0.85 * k}
                        fill={LAYER_COLORS.photos}
                        stroke="var(--color-background-primary)"
                        strokeWidth={2 * k}
                      >
                        <title>{title}</title>
                      </circle>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={dims.marker * 0.3 * k}
                        fill="var(--color-background-primary)"
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}

              {projected.start && (
                <circle
                  cx={projected.start.x}
                  cy={projected.start.y}
                  r={dims.marker * k}
                  fill="var(--color-text-success)"
                  stroke="var(--color-background-primary)"
                  strokeWidth={2 * k}
                />
              )}
              {projected.end && (
                <circle
                  cx={projected.end.x}
                  cy={projected.end.y}
                  r={dims.marker * k}
                  fill="var(--color-text-danger)"
                  stroke="var(--color-background-primary)"
                  strokeWidth={2 * k}
                />
              )}

              {scrubPoint && scrubValue != null && activeSeries && (
                <circle
                  cx={scrubPoint.x}
                  cy={scrubPoint.y}
                  r={(dims.marker - 1) * k}
                  fill={colorForValue(activeSeries, scrubValue)}
                  stroke="var(--color-background-primary)"
                  strokeWidth={2 * k}
                />
              )}
            </svg>
          </div>

          {scrubInView && scrubValue != null && activeSeries && (
            <div
              className={styles.scrubTip}
              data-flip={scrubFraction.x > 0.55 || undefined}
              style={{
                left: `${scrubFraction.x * 100}%`,
                top: `${scrubFraction.y * 100}%`,
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
          onPointerLeave={() => setScrubIndex(null)}
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

      {projected && (series.length > 0 || zoomed) && (
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
          {zoomed && (
            <PillGroup>
              <Pill active onClick={() => setView(base)}>
                Reset view
              </Pill>
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
            {layers.length > 0 && (
              <Legend size={isMobile ? "touch" : "default"}>
                {layers.map((layer) => (
                  <LegendItem
                    key={layer.key}
                    color={LAYER_COLORS[layer.key]}
                    label={layer.label}
                    hidden={hiddenLayers.has(layer.key)}
                    onClick={() => toggleLayer(layer.key)}
                  />
                ))}
              </Legend>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
