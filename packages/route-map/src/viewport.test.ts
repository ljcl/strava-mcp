import { describe, expect, it } from "vitest";
import { type ViewBox } from "./panZoom";
import { frameForIndexRange, indexRangeForDistance } from "./viewport";

/** A 10 km course sampled every 100 m. */
const distance = Array.from({ length: 101 }, (_, i) => i * 100);

describe("indexRangeForDistance", () => {
  it("covers the samples inside the requested window", () => {
    expect(indexRangeForDistance(distance, 2000, 3000)).toEqual({
      from: 20,
      to: 30,
    });
  });

  it("accepts the window either way round", () => {
    expect(indexRangeForDistance(distance, 3000, 2000)).toEqual(
      indexRangeForDistance(distance, 2000, 3000),
    );
  });

  it("clamps a window that overhangs the end", () => {
    // "The last 5 km" of a 10 km course asked for loosely as 8–20 km.
    expect(indexRangeForDistance(distance, 8000, 20000)).toEqual({
      from: 80,
      to: 100,
    });
  });

  it("returns null for a window entirely past the finish", () => {
    // The caller says "this route is only 10 km" rather than silently
    // framing the finish as if the request had been satisfied.
    expect(indexRangeForDistance(distance, 15000, 20000)).toBeNull();
  });

  it("returns null for an empty distance stream", () => {
    expect(indexRangeForDistance([], 0, 1000)).toBeNull();
  });

  it("widens a window narrower than the sample spacing", () => {
    // A single point has no extent to frame; there must be a line to see.
    const range = indexRangeForDistance(distance, 2000, 2010)!;
    expect(range.to).toBeGreaterThan(range.from);
  });

  it("widens backwards at the very end, where there is no next sample", () => {
    const range = indexRangeForDistance(distance, 10000, 10000)!;
    expect(range.to).toBeGreaterThan(range.from);
    expect(range.to).toBe(100);
  });
});

describe("frameForIndexRange", () => {
  const base: ViewBox = { x: 0, y: 0, w: 400, h: 200 };
  /** Points marching left to right across the frame. */
  const points = Array.from({ length: 101 }, (_, i) => ({
    x: i * 4,
    y: 100,
  }));

  it("centres the framed stretch", () => {
    const view = frameForIndexRange(points, { from: 20, to: 30 }, base)!;
    // Points 20..30 span x 80..120, centre 100.
    expect(view.x + view.w / 2).toBeCloseTo(100, 5);
  });

  it("keeps the base aspect ratio so the stretch is not letterboxed", () => {
    const view = frameForIndexRange(points, { from: 20, to: 30 }, base)!;
    expect(view.w / view.h).toBeCloseTo(base.w / base.h, 5);
  });

  it("zooms in: a short stretch gets a smaller window than the whole frame", () => {
    const view = frameForIndexRange(points, { from: 20, to: 30 }, base)!;
    expect(view.w).toBeLessThan(base.w);
  });

  it("never escapes the base frame", () => {
    const view = frameForIndexRange(points, { from: 0, to: 3 }, base)!;
    expect(view.x).toBeGreaterThanOrEqual(base.x);
    expect(view.y).toBeGreaterThanOrEqual(base.y);
    expect(view.x + view.w).toBeLessThanOrEqual(base.x + base.w + 1e-6);
    expect(view.y + view.h).toBeLessThanOrEqual(base.y + base.h + 1e-6);
  });

  it("falls back to the deepest zoom for a stretch with no extent", () => {
    // A lap run on the spot projects to a single point.
    const stacked = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ];
    const view = frameForIndexRange(stacked, { from: 0, to: 1 }, base)!;
    expect(view.w).toBeCloseTo(base.w / 8, 5);
    expect(view.w).toBeGreaterThan(0);
  });

  it("returns null when the range selects nothing", () => {
    expect(frameForIndexRange([], { from: 0, to: 5 }, base)).toBeNull();
  });

  it("framing the whole course comes back to the base frame", () => {
    const view = frameForIndexRange(points, { from: 0, to: 100 }, base)!;
    expect(view.w).toBeCloseTo(base.w, 5);
  });
});
