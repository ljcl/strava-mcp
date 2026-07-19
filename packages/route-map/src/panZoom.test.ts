import { describe, expect, it } from "vitest";
import {
  canZoomIn,
  clampView,
  isZoomed,
  MAX_ZOOM,
  panByFraction,
  panViewBox,
  type ViewBox,
  zoomAboutCenter,
  zoomLevel,
  zoomViewBox,
} from "./panZoom";

const BASE: ViewBox = { x: 0, y: 0, w: 640, h: 380 };

describe("isZoomed", () => {
  it("is false at the base frame and true when the viewport shrinks", () => {
    expect(isZoomed(BASE, BASE)).toBe(false);
    expect(isZoomed({ x: 0, y: 0, w: 320, h: 190 }, BASE)).toBe(true);
  });
});

describe("canZoomIn", () => {
  it("is true until the viewport reaches the MAX_ZOOM floor", () => {
    expect(canZoomIn(BASE, BASE)).toBe(true);
    const deepest = clampView(
      { x: 0, y: 0, w: BASE.w / MAX_ZOOM, h: BASE.h / MAX_ZOOM },
      BASE,
    );
    expect(canZoomIn(deepest, BASE)).toBe(false);
  });
});

describe("zoomLevel", () => {
  it("reports the multiplier relative to the base frame", () => {
    expect(zoomLevel(BASE, BASE)).toBeCloseTo(1);
    expect(zoomLevel({ x: 0, y: 0, w: 320, h: 190 }, BASE)).toBeCloseTo(2);
  });
});

describe("zoomAboutCenter", () => {
  it("keeps the viewport centre fixed while zooming in", () => {
    const view = zoomAboutCenter(BASE, BASE, 2);
    expect(view.w).toBe(BASE.w / 2);
    // The centre of the base frame is still the centre of the zoomed view.
    expect(view.x + view.w / 2).toBeCloseTo(BASE.w / 2);
    expect(view.y + view.h / 2).toBeCloseTo(BASE.h / 2);
  });

  it("zooming out from base stays at base", () => {
    expect(zoomAboutCenter(BASE, BASE, 0.5)).toEqual(BASE);
  });
});

describe("panByFraction", () => {
  it("pans by fractions of the current viewport, clamped to the frame", () => {
    const zoomed = zoomAboutCenter(BASE, BASE, 2); // w=320, h=190, centred
    const panned = panByFraction(zoomed, BASE, 0.25, -0.5);
    expect(panned.x).toBeCloseTo(zoomed.x + 0.25 * zoomed.w);
    expect(panned.y).toBeCloseTo(zoomed.y - 0.5 * zoomed.h);
  });

  it("cannot move the viewport at base zoom", () => {
    expect(panByFraction(BASE, BASE, 0.5, 0.5)).toEqual(BASE);
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
