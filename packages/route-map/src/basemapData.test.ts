import { describe, expect, it } from "vitest";
import { nearestLatLngIndex, trackBounds, trackToGeoJson } from "./basemapData";

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

describe("nearestLatLngIndex", () => {
  it("returns -1 for an empty track", () => {
    expect(nearestLatLngIndex([], 37.77, -122.51)).toBe(-1);
  });

  it("snaps a nearby position to the closest sample", () => {
    expect(nearestLatLngIndex(COORDS, 37.776, -122.499)).toBe(1);
    expect(nearestLatLngIndex(COORDS, 37.79, -122.475)).toBe(3);
  });
});
