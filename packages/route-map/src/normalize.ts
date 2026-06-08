/**
 * Pure projection math for the route map. No map tiles, no network: lat/lng
 * pairs are projected into a fixed SVG coordinate frame, fit to the frame's
 * bounds with padding, and centred. Kept side-effect free so it can be
 * unit-tested away from React and Recharts.
 */

export interface Point {
  x: number;
  y: number;
}

export interface ProjectOptions {
  /** SVG viewBox width. */
  width: number;
  /** SVG viewBox height. */
  height: number;
  /** Padding (in viewBox units) kept clear on every edge. */
  padding: number;
}

export interface ProjectedRoute {
  /** Projected polyline points, in draw order. */
  points: Point[];
  /** SVG path `d` string for the polyline. */
  path: string;
  /** Projected first point. */
  start: Point | null;
  /** Projected last point. */
  end: Point | null;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Project `[lat, lng]` coordinates into the SVG frame described by `opts`.
 *
 * Longitude degrees are scaled by `cos(meanLatitude)` so the route keeps its
 * true shape instead of stretching east–west (an equirectangular projection,
 * accurate enough at the scale of a single activity). The path is then scaled
 * uniformly to fit within the padded frame and centred, with latitude flipped
 * so north points up.
 */
export function projectRoute(
  coordinates: Array<[number, number]>,
  opts: ProjectOptions,
): ProjectedRoute | null {
  if (coordinates.length === 0) return null;

  const { width, height, padding } = opts;

  const meanLat =
    coordinates.reduce((sum, [lat]) => sum + lat, 0) / coordinates.length;
  const lngScale = Math.cos(meanLat * DEG_TO_RAD);

  // Planar coordinates: x grows east, y grows north (flipped to SVG later).
  const planar = coordinates.map(([lat, lng]) => ({
    px: lng * lngScale,
    py: lat,
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { px, py } of planar) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const availW = width - 2 * padding;
  const availH = height - 2 * padding;

  // Uniform scale that fits both axes; a degenerate (zero-width or single
  // point) span contributes no constraint, so fall back to the other axis.
  const sx = spanX > 1e-9 ? availW / spanX : Number.POSITIVE_INFINITY;
  const sy = spanY > 1e-9 ? availH / spanY : Number.POSITIVE_INFINITY;
  let scale = Math.min(sx, sy);
  if (!Number.isFinite(scale)) scale = 1;

  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (availW - drawnW) / 2;
  const offsetY = padding + (availH - drawnH) / 2;

  const points: Point[] = planar.map(({ px, py }) => ({
    x: offsetX + (px - minX) * scale,
    // Flip Y: the northern-most point (maxY) sits at the top of the frame.
    y: offsetY + (maxY - py) * scale,
  }));

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");

  return {
    points,
    path,
    start: points[0] ?? null,
    end: points[points.length - 1] ?? null,
  };
}

/** Trim coordinates to 2 dp so the generated path string stays compact. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
