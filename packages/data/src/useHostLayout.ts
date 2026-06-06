import { type McpUiHostContext } from "@modelcontextprotocol/ext-apps";

export interface HostLayout {
  /** "mobile" renders compact layouts; callers pass this in explicitly
   * because reliable detection needs live window.innerWidth, which is a
   * React hook concern, not a pure function concern. */
  mode: "mobile" | "desktop";
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

/**
 * Derive layout tokens from the host context plus an explicit mobile flag.
 * The mobile flag should come from `useMobileMode()` in `@strava-mcp/ui`,
 * which combines container dimensions, device capabilities, live viewport
 * width, and UA sniffing into a single reliable signal.
 */
export function getHostLayout(
  hostContext: McpUiHostContext | undefined | null,
  isMobile: boolean,
): HostLayout {
  const dims = hostContext?.containerDimensions;
  const touch = hostContext?.deviceCapabilities?.touch ?? false;

  const width = dims
    ? "width" in dims
      ? dims.width
      : "maxWidth" in dims
        ? (dims.maxWidth ?? null)
        : null
    : null;

  const height = dims
    ? "height" in dims
      ? dims.height
      : "maxHeight" in dims
        ? (dims.maxHeight ?? null)
        : null
    : null;

  const chartAspect = isMobile ? 0.95 : 1.8;
  const chartHeight = isMobile ? 260 : 320;

  return {
    mode: isMobile ? "mobile" : "desktop",
    width,
    height,
    isTouch: touch,
    chartAspect,
    chartHeight,
  };
}
