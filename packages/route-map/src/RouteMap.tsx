import { type ModelContextApp, useModelContextSync } from "@strava-mcp/ui";
import { useMemo } from "react";
import { buildRouteMapContextSummary } from "./contextSummary";
import { projectRoute } from "./normalize";
import styles from "./RouteMap.module.css";
import { type RouteMapData } from "./types";

interface RouteMapProps {
  data: RouteMapData;
  mode?: "mobile" | "desktop";
  app?: ModelContextApp;
}

/** Frame geometry per layout. All values are SVG viewBox units. */
const DIMS = {
  desktop: { width: 640, height: 380, padding: 28, stroke: 3, marker: 6 },
  mobile: { width: 340, height: 300, padding: 22, stroke: 3.5, marker: 7 },
} as const;

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
      }),
    [
      data.name,
      data.source,
      distanceKm,
      data.elevationGain,
      projected !== null,
    ],
  );

  const subtitle = [
    data.activityType,
    data.source === "route" ? "Route" : "Activity",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.container} data-compact={isMobile || undefined}>
      <div className={styles.header}>
        <div className={styles.title}>{data.name}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>

      {projected ? (
        <div className={styles.mapWrap}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Map of ${data.name}, ${formatKm(data.distance)} kilometres`}
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

            <path
              d={projected.path}
              fill="none"
              stroke="var(--chart-pace)"
              strokeWidth={dims.stroke}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

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
          </svg>
        </div>
      ) : (
        <div className={styles.empty}>
          No GPS track is available for this {data.source}.
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
