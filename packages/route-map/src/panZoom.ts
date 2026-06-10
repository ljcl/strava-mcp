/**
 * ViewBox math for the map's zoom/pan. The map zooms by shrinking the SVG
 * viewBox (a window onto the fixed base frame) and pans by moving it, always
 * clamped inside the base frame so the track cannot be lost off-screen. Pure
 * math, unit-tested away from the pointer/wheel plumbing.
 */

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Deepest zoom-in: the viewport can shrink to 1/8 of the base frame. */
export const MAX_ZOOM = 8;

/** Whether the view is zoomed in relative to its base frame. */
export function isZoomed(view: ViewBox, base: ViewBox): boolean {
  return view.w < base.w - 1e-6;
}

/**
 * Clamp a candidate view inside the base frame: size between base/MAX_ZOOM
 * and base, position fully contained.
 */
export function clampView(view: ViewBox, base: ViewBox): ViewBox {
  const w = Math.min(Math.max(view.w, base.w / MAX_ZOOM), base.w);
  const h = Math.min(Math.max(view.h, base.h / MAX_ZOOM), base.h);
  const x = Math.min(Math.max(view.x, base.x), base.x + base.w - w);
  const y = Math.min(Math.max(view.y, base.y), base.y + base.h - h);
  return { x, y, w, h };
}

/**
 * Zoom by `factor` (> 1 zooms in) keeping the focal point (cx, cy) — in
 * viewBox units — fixed on screen, then clamp to the base frame.
 */
export function zoomViewBox(
  view: ViewBox,
  base: ViewBox,
  factor: number,
  cx: number,
  cy: number,
): ViewBox {
  if (factor <= 0) return view;
  const w = view.w / factor;
  const h = view.h / factor;
  const fx = (cx - view.x) / view.w;
  const fy = (cy - view.y) / view.h;
  return clampView({ x: cx - fx * w, y: cy - fy * h, w, h }, base);
}

/** Pan by (dx, dy) in viewBox units, clamped to the base frame. */
export function panViewBox(
  view: ViewBox,
  base: ViewBox,
  dx: number,
  dy: number,
): ViewBox {
  return clampView(
    { x: view.x + dx, y: view.y + dy, w: view.w, h: view.h },
    base,
  );
}
