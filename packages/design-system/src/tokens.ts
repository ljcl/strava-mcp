/** Surface colors — light mode defaults (overridden by host CSS vars at runtime) */
export const COLORS = {
  background: {
    primary: "#ffffff",
    secondary: "#f5f4ed",
    tertiary: "#faf9f5",
    inverse: "#141413",
  },
  border: {
    primary: "rgba(31, 30, 29, 0.40)",
    secondary: "rgba(31, 30, 29, 0.30)",
    tertiary: "rgba(31, 30, 29, 0.15)",
  },
  text: {
    danger: "#7f2c28",
    info: "#3266ad",
    inverse: "#ffffff",
    primary: "#14141a",
    secondary: "#3d3d3a",
    success: "#275b19",
    tertiary: "#6e6d67",
  },
} as const;

/** Chart data series colors (Strava activity metrics) */
export const CHART_COLORS = {
  altitude: "#22c55e",
  cadence: "#f97316",
  grade: "#6b7280",
  heartrate: "#ef4444",
  pace: "#3b82f6",
  power: "#8b5cf6",
} as const;

/**
 * Achievement-tier colors: gold = PR, light purple = top-10. Intentionally
 * theme-invariant (no dark override) — they flag achievement tiers and must
 * read identically against multi-hue metric tracks in both themes. Exposed
 * as TS constants because MapLibre paints onto canvas and cannot resolve
 * CSS custom properties; `--color-tier-*` in tokens.css mirror these for
 * CSS consumers.
 */
export const TIER_COLORS = {
  pr: "#f59e0b",
  top10: "#a78bfa",
} as const;
