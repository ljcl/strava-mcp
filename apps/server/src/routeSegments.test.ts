import { describe, expect, it } from "vitest";
import { cumulativeDistances } from "./mapAnchors";
import {
  boundsString,
  buildTiles,
  dedupeInCourseOrder,
  MAX_TILES,
  placeOnTrack,
  TILE_DISTANCE_M,
  type TrackPlacement,
} from "./routeSegments";

/**
 * A due-north track of `points` samples spaced `stepDeg` of latitude apart.
 * 0.001° of latitude is ~111 m, so the default is a ~111 m sample spacing.
 */
function northTrack(points: number, stepDeg = 0.001) {
  const coordinates: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    coordinates.push([-37.8 + i * stepDeg, 144.9]);
  }
  return { coordinates, distances: cumulativeDistances(coordinates) };
}

describe("buildTiles", () => {
  it("covers the course in tiles of the requested length", () => {
    // ~55 samples ≈ 6 km of track.
    const { coordinates, distances } = northTrack(55);

    const tiles = buildTiles(coordinates, distances, {
      tileDistanceM: 2000,
      overlapM: 0,
      maxTiles: 20,
    });

    expect(tiles).toHaveLength(3);
    expect(tiles[0]?.startM).toBe(0);
    expect(tiles[1]?.startM).toBe(2000);
    expect(tiles[2]?.startM).toBe(4000);
  });

  it("widens tiles rather than covering only part of a long course", () => {
    // ~200 samples ≈ 22 km, which at 2 km per tile would need 11 tiles.
    const { coordinates, distances } = northTrack(400);

    const tiles = buildTiles(coordinates, distances, {
      tileDistanceM: 2000,
      maxTiles: 4,
    });

    expect(tiles.length).toBeLessThanOrEqual(4);
    // The final tile reaches the end of the course: coverage is complete.
    const total = distances[distances.length - 1]!;
    expect(tiles[tiles.length - 1]?.endM).toBeCloseTo(Math.round(total), 0);
  });

  it("defaults to a bounded number of tiles", () => {
    const { coordinates, distances } = northTrack(2000);

    const tiles = buildTiles(coordinates, distances);

    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(tiles.length).toBeGreaterThan(1);
  });

  it("overlaps consecutive tiles so a straddling segment sits inside one", () => {
    const { coordinates, distances } = northTrack(55);

    const tiles = buildTiles(coordinates, distances, {
      tileDistanceM: 2000,
      overlapM: 400,
      maxTiles: 20,
    });

    expect(tiles[0]?.endM).toBe(2400);
    expect(tiles[1]?.startM).toBe(2000);
  });

  it("pads each box so an endpoint just off the line is inside it", () => {
    const { coordinates, distances } = northTrack(10);

    const [tile] = buildTiles(coordinates, distances, { paddingM: 150 });

    expect(tile).toBeDefined();
    // The track sits on one meridian; padding gives the box real width.
    expect(tile!.bounds.neLng).toBeGreaterThan(144.9);
    expect(tile!.bounds.swLng).toBeLessThan(144.9);
    expect(tile!.bounds.swLat).toBeLessThan(-37.8);
  });

  it("returns nothing for empty or misaligned input", () => {
    expect(buildTiles([], [])).toEqual([]);
    expect(buildTiles([[1, 2]], [0, 100])).toEqual([]);
  });

  it("still yields one tile for a course that does not advance", () => {
    const coordinates: Array<[number, number]> = [
      [1, 2],
      [1, 2],
    ];

    expect(buildTiles(coordinates, [0, 0])).toHaveLength(1);
  });
});

describe("boundsString", () => {
  it("emits explore's sw,ne order", () => {
    expect(
      boundsString({ swLat: -37.9, swLng: 144.8, neLat: -37.7, neLng: 145 }),
    ).toBe("-37.9,144.8,-37.7,145");
  });
});

describe("placeOnTrack", () => {
  const { coordinates, distances } = northTrack(20);

  it("places a segment that runs along the course", () => {
    const placement = placeOnTrack(
      coordinates,
      distances,
      [-37.798, 144.9],
      [-37.795, 144.9],
    );

    expect(placement).not.toBeNull();
    expect(placement?.startIndex).toBe(2);
    expect(placement?.endIndex).toBe(5);
    expect(placement?.startM).toBeGreaterThan(200);
    expect(placement?.offCourseM).toBeLessThan(10);
  });

  it("rejects a segment running the other way", () => {
    // Same two points, swapped: the end snaps before the start.
    expect(
      placeOnTrack(coordinates, distances, [-37.795, 144.9], [-37.798, 144.9]),
    ).toBeNull();
  });

  it("rejects a segment whose endpoints are off the course", () => {
    // ~880 m east of the track at this latitude.
    expect(
      placeOnTrack(
        coordinates,
        distances,
        [-37.798, 144.91],
        [-37.795, 144.91],
      ),
    ).toBeNull();
  });

  it("accepts a near-miss once the tolerance is raised", () => {
    const off: [number, number][] = [
      [-37.798, 144.9012],
      [-37.795, 144.9012],
    ];

    expect(placeOnTrack(coordinates, distances, off[0], off[1], 50)).toBeNull();
    expect(
      placeOnTrack(coordinates, distances, off[0], off[1], 200),
    ).not.toBeNull();
  });

  it("reports how far off the course the endpoints sat", () => {
    const placement = placeOnTrack(
      coordinates,
      distances,
      [-37.798, 144.9005],
      [-37.795, 144.9],
      200,
    );

    expect(placement?.offCourseM).toBeGreaterThan(30);
    expect(placement?.offCourseM).toBeLessThan(60);
  });

  it("rejects missing or malformed endpoints", () => {
    expect(
      placeOnTrack(coordinates, distances, undefined, [-37.795, 144.9]),
    ).toBeNull();
    expect(
      placeOnTrack(coordinates, distances, [1], [-37.795, 144.9]),
    ).toBeNull();
    expect(placeOnTrack([], [], [1, 2], [3, 4])).toBeNull();
  });
});

describe("dedupeInCourseOrder", () => {
  const placement = (startM: number, offCourseM = 5): TrackPlacement => ({
    startIndex: 0,
    endIndex: 1,
    startM,
    endM: startM + 500,
    offCourseM,
  });

  it("orders segments by where they start on the course", () => {
    const ordered = dedupeInCourseOrder([
      { id: "c", placement: placement(3000) },
      { id: "a", placement: placement(500) },
      { id: "b", placement: placement(1800) },
    ]);

    expect(ordered.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the closest placement when overlapping tiles repeat a segment", () => {
    const ordered = dedupeInCourseOrder([
      { id: "a", placement: placement(2000, 40) },
      { id: "a", placement: placement(2010, 6) },
    ]);

    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.placement.offCourseM).toBe(6);
  });

  it("breaks an equal-distance tie on the earlier position", () => {
    const ordered = dedupeInCourseOrder([
      { id: "a", placement: placement(2500, 10) },
      { id: "a", placement: placement(400, 10) },
    ]);

    expect(ordered[0]?.placement.startM).toBe(400);
  });
});

describe("tile constants", () => {
  it("keeps the default fan-out inside the documented cap", () => {
    expect(TILE_DISTANCE_M).toBeGreaterThan(0);
    expect(MAX_TILES).toBeGreaterThan(0);
  });
});
