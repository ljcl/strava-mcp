import { describe, expect, it } from "vitest";
import { WAYPOINT_COLORS } from "./annotations";
import {
  BASEMAP_COLORS,
  nearestLatLngIndex,
  photosToGeoJson,
  segmentsToGeoJson,
  splitsToGeoJson,
  trackBounds,
  trackToGeoJson,
  waypointsToGeoJson,
} from "./basemapData";

const COORDS: Array<[number, number]> = [
  [37.77, -122.51],
  [37.775, -122.5],
  [37.78, -122.49],
  [37.785, -122.48],
];

describe("trackToGeoJson", () => {
  it("emits one plain feature when there are no color runs", () => {
    const fc = trackToGeoJson(COORDS, [], "#3b82f6");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties.color).toBe("#3b82f6");
    // GeoJSON is [lng, lat] — reversed from the app's [lat, lng].
    expect(fc.features[0]!.geometry.coordinates[0]).toEqual([-122.51, 37.77]);
  });

  it("emits nothing for a track with fewer than two points", () => {
    expect(trackToGeoJson([COORDS[0]!], [], "#000").features).toHaveLength(0);
  });

  it("emits one feature per color run, sharing boundary samples", () => {
    const runs = [
      { startIndex: 0, endIndex: 2, color: "rgb(1, 2, 3)" },
      { startIndex: 2, endIndex: 3, color: "rgb(4, 5, 6)" },
    ];
    const fc = trackToGeoJson(COORDS, runs, "#000");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties.color).toBe("rgb(1, 2, 3)");
    expect(fc.features[0]!.geometry.coordinates).toHaveLength(3);
    // The second run starts on the first run's last sample — no gaps.
    expect(fc.features[1]!.geometry.coordinates[0]).toEqual(
      fc.features[0]!.geometry.coordinates[2],
    );
  });
});

describe("trackBounds", () => {
  it("returns null for an empty track", () => {
    expect(trackBounds([])).toBeNull();
  });

  it("returns [[west, south], [east, north]]", () => {
    expect(trackBounds(COORDS)).toEqual([
      [-122.51, 37.77],
      [-122.48, 37.785],
    ]);
  });
});

describe("segmentsToGeoJson", () => {
  it("colors by achievement tier and titles for the popup", () => {
    const fc = segmentsToGeoJson(COORDS, [
      {
        name: "Climb",
        startIndex: 0,
        endIndex: 2,
        distanceMeters: 800,
        isPr: true,
        isTop10: false,
      },
      {
        name: "Sprint",
        startIndex: 1,
        endIndex: 3,
        distanceMeters: 400,
        isPr: false,
        isTop10: true,
      },
      {
        name: "Flat",
        startIndex: 2,
        endIndex: 3,
        distanceMeters: 600,
        isPr: false,
        isTop10: false,
      },
    ]);
    expect(fc.features.map((f) => f.properties.color)).toEqual([
      BASEMAP_COLORS.segmentPr,
      BASEMAP_COLORS.segmentTop10,
      BASEMAP_COLORS.segment,
    ]);
    expect(fc.features[0]!.properties.title).toBe("Climb · PR");
    expect(fc.features[1]!.properties.title).toBe("Sprint · Top 10");
    expect(fc.features[2]!.properties.title).toBe("Flat");
  });

  it("drops spans that collapse to fewer than two points", () => {
    const fc = segmentsToGeoJson(COORDS, [
      {
        name: "Dot",
        startIndex: 2,
        endIndex: 2,
        distanceMeters: 100,
        isPr: false,
        isTop10: false,
      },
    ]);
    expect(fc.features).toHaveLength(0);
  });
});

describe("splitsToGeoJson / photosToGeoJson", () => {
  it("emits titled points at marker indices, in [lng, lat] order", () => {
    const splits = splitsToGeoJson(COORDS, [{ index: 1, label: "1 km" }]);
    expect(splits.features[0]!.properties.title).toBe("1 km");
    expect(splits.features[0]!.geometry.coordinates).toEqual([-122.5, 37.775]);

    const photos = photosToGeoJson(COORDS, [
      { index: 2, count: 2, caption: "Summit" },
      { index: 99, count: 1, caption: null },
    ]);
    // The out-of-range marker is dropped.
    expect(photos.features).toHaveLength(1);
    expect(photos.features[0]!.properties.title).toBe("2 photos · Summit");
  });
});

describe("waypointsToGeoJson", () => {
  it("emits titled points coloured by kind, dropping out-of-range indices", () => {
    const fc = waypointsToGeoJson(COORDS, [
      { index: 1, kind: "fuel", title: "Gel 1 · 11 km" },
      { index: 99, kind: "water", title: "Aid station · 20 km" },
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toEqual({
      title: "Gel 1 · 11 km",
      color: WAYPOINT_COLORS.fuel,
    });
    expect(fc.features[0]!.geometry.coordinates).toEqual([-122.5, 37.775]);
  });
});

describe("nearestLatLngIndex", () => {
  it("returns -1 for an empty track", () => {
    expect(nearestLatLngIndex([], 37.77, -122.51)).toBe(-1);
  });

  it("snaps a nearby position to the closest sample", () => {
    expect(nearestLatLngIndex(COORDS, 37.776, -122.499)).toBe(1);
    expect(nearestLatLngIndex(COORDS, 37.79, -122.475)).toBe(3);
  });
});
