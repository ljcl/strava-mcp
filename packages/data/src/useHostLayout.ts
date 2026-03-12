import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";

export interface HostLayout {
  /** "compact" when container < 400px wide or platform is "mobile" */
  mode: "compact" | "normal";
  /** Available width in pixels, or null if unbounded */
  width: number | null;
  /** Available height in pixels, or null if unbounded */
  height: number | null;
  /** Whether device supports touch input */
  isTouch: boolean;
  /** Chart aspect ratio — taller on narrow screens */
  chartAspect: number;
  /** Chart height for fixed-height views (cadence trends) */
  chartHeight: number;
}

export function getHostLayout(
  hostContext: McpUiHostContext | undefined | null,
): HostLayout {
  const dims = hostContext?.containerDimensions;
  const platform = hostContext?.platform;
  const touch = hostContext?.deviceCapabilities?.touch ?? false;

  // Extract width (fixed or max)
  const width = dims
    ? "width" in dims
      ? dims.width
      : "maxWidth" in dims
        ? (dims.maxWidth ?? null)
        : null
    : null;

  // Extract height (fixed or max)
  const height = dims
    ? "height" in dims
      ? dims.height
      : "maxHeight" in dims
        ? (dims.maxHeight ?? null)
        : null
    : null;

  const isCompact = platform === "mobile" || (width !== null && width < 400);

  const chartAspect = isCompact ? 1.2 : 1.8;
  const chartHeight = isCompact ? 240 : 320;

  return {
    mode: isCompact ? "compact" : "normal",
    width,
    height,
    isTouch: touch,
    chartAspect,
    chartHeight,
  };
}
