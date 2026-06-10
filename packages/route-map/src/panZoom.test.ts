import { describe, expect, it } from "vitest";
import {
  clampView,
  isZoomed,
  MAX_ZOOM,
  panViewBox,
  type ViewBox,
  zoomViewBox,
} from "./panZoom";

const BASE: ViewBox = { x: 0, y: 0, w: 640, h: 380 };

describe("isZoomed", () => {
  it("is false at the base frame and true when the viewport shrinks", () => {
    expect(isZoomed(BASE, BASE)).toBe(false);
    expect(isZoomed({ x: 0, y: 0, w: 320, h: 190 }, BASE)).toBe(true);
  });
});

describe("clampView", () => {
  it("limits zoom-in to MAX_ZOOM and zoom-out to the base frame", () => {
    const tiny = clampView({ x: 0, y: 0, w: 1, h: 1 }, BASE);
    expect(tiny.w).toBeCloseTo(BASE.w / MAX_ZOOM);
    expect(tiny.h).toBeCloseTo(BASE.h / MAX_ZOOM);

    const huge = clampView({ x: 0, y: 0, w: 9999, h: 9999 }, BASE);
    expect(huge).toEqual(BASE);
  });

  it("keeps the viewport inside the base frame", () => {
    const view = clampView({ x: 600, y: -50, w: 320, h: 190 }, BASE);
    expect(view.x).toBe(BASE.w - 320);
    expect(view.y).toBe(0);
  });
});

describe("zoomViewBox", () => {
  it("keeps the focal point fixed while zooming in", () => {
    const cx = 160;
    const cy = 95;
    const view = zoomViewBox(BASE, BASE, 2, cx, cy);
    expect(view.w).toBe(BASE.w / 2);
    // The focal point sat at 25% of the viewport; it still does.
    expect((cx - view.x) / view.w).toBeCloseTo(0.25);
    expect((cy - view.y) / view.h).toBeCloseTo(0.25);
  });

  it("zooming out from base stays at base", () => {
    expect(zoomViewBox(BASE, BASE, 0.5, 320, 190)).toEqual(BASE);
  });

  it("ignores non-positive factors", () => {
    expect(zoomViewBox(BASE, BASE, 0, 320, 190)).toEqual(BASE);
  });
});

describe("panViewBox", () => {
  it("moves the viewport and clamps at the frame edges", () => {
    const zoomed = zoomViewBox(BASE, BASE, 2, 320, 190);
    const panned = panViewBox(zoomed, BASE, 40, -10);
    expect(panned.x).toBe(zoomed.x + 40);
    expect(panned.y).toBe(zoomed.y - 10);

    const slammed = panViewBox(zoomed, BASE, 99999, 99999);
    expect(slammed.x).toBe(BASE.w - zoomed.w);
    expect(slammed.y).toBe(BASE.h - zoomed.h);
  });

  it("cannot pan at all when not zoomed", () => {
    expect(panViewBox(BASE, BASE, 50, 50)).toEqual(BASE);
  });
});
