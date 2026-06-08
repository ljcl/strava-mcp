import { describe, expect, it } from "vitest";
import { projectRoute } from "./normalize";

const OPTS = { width: 600, height: 400, padding: 20 };

describe("projectRoute", () => {
  it("returns null for an empty path", () => {
    expect(projectRoute([], OPTS)).toBeNull();
  });

  it("keeps every point inside the padded frame", () => {
    const coords: Array<[number, number]> = [
      [37.81, -122.48],
      [37.82, -122.46],
      [37.8, -122.45],
      [37.79, -122.47],
      [37.81, -122.48],
    ];
    const projected = projectRoute(coords, OPTS)!;
    expect(projected).not.toBeNull();
    for (const p of projected.points) {
      expect(p.x).toBeGreaterThanOrEqual(OPTS.padding - 0.01);
      expect(p.x).toBeLessThanOrEqual(OPTS.width - OPTS.padding + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(OPTS.padding - 0.01);
      expect(p.y).toBeLessThanOrEqual(OPTS.height - OPTS.padding + 0.01);
    }
  });

  it("starts the path with a moveto and exposes start/end", () => {
    const coords: Array<[number, number]> = [
      [10, 20],
      [10.1, 20.1],
      [10.2, 20.0],
    ];
    const projected = projectRoute(coords, OPTS)!;
    expect(projected.path.startsWith("M")).toBe(true);
    expect(projected.path).toContain("L");
    expect(projected.start).toEqual(projected.points[0]);
    expect(projected.end).toEqual(
      projected.points[projected.points.length - 1],
    );
  });

  it("flips latitude so the northern-most point is at the top", () => {
    const coords: Array<[number, number]> = [
      [10, 0], // south
      [20, 0], // north
    ];
    const projected = projectRoute(coords, OPTS)!;
    const [south, north] = projected.points;
    expect(north!.y).toBeLessThan(south!.y);
  });

  it("centres a horizontal route within the frame height", () => {
    // A due-east line has zero north–south span, so it must be vertically
    // centred rather than scaled to fill the frame.
    const coords: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    const projected = projectRoute(coords, OPTS)!;
    for (const p of projected.points) {
      expect(p.y).toBeCloseTo(OPTS.height / 2, 5);
    }
  });

  it("does not throw on a single point", () => {
    const projected = projectRoute([[45, -73]], OPTS)!;
    expect(projected.points).toHaveLength(1);
    expect(projected.start).toEqual(projected.end);
  });

  it("preserves aspect ratio (no east–west stretch)", () => {
    // A square in lat/lng near the equator should stay roughly square once
    // projected, because longitude is cos-scaled and the fit is uniform.
    const coords: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const projected = projectRoute(coords, OPTS)!;
    const xs = projected.points.map((p) => p.x);
    const ys = projected.points.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(w).toBeCloseTo(h, 1);
  });
});
