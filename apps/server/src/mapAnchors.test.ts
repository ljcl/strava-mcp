import { describe, expect, it } from "vitest";
import { indexAtDistance, nearestCoordIndex } from "./mapAnchors";

describe("nearestCoordIndex", () => {
  const track: Array<[number, number]> = [
    [37.77, -122.51],
    [37.775, -122.5],
    [37.78, -122.49],
    [37.785, -122.48],
  ];

  it("returns -1 for an empty track", () => {
    expect(nearestCoordIndex([], 37.77, -122.51)).toBe(-1);
  });

  it("finds an exact match", () => {
    expect(nearestCoordIndex(track, 37.78, -122.49)).toBe(2);
  });

  it("snaps a nearby point to the closest coordinate", () => {
    expect(nearestCoordIndex(track, 37.7752, -122.4995)).toBe(1);
    expect(nearestCoordIndex(track, 37.79, -122.475)).toBe(3);
  });

  it("scales longitude so east-west offsets are not overweighted", () => {
    // At 60°N a degree of longitude is half a degree of latitude. The probe
    // sits 0.2° east of A and 0.15° north of B; unscaled, A would win.
    const coords: Array<[number, number]> = [
      [60, 10], // A
      [60.15, 10.2], // B
    ];
    expect(nearestCoordIndex(coords, 60, 10.2)).toBe(0);
    expect(nearestCoordIndex(coords, 60.15, 10.0), "control").toBe(1);
  });
});

describe("indexAtDistance", () => {
  const stream = [0, 100, 250, 500, 1000];

  it("returns -1 for an empty stream", () => {
    expect(indexAtDistance([], 100)).toBe(-1);
  });

  it("finds the first index reaching the target", () => {
    expect(indexAtDistance(stream, 0)).toBe(0);
    expect(indexAtDistance(stream, 100)).toBe(1);
    expect(indexAtDistance(stream, 101)).toBe(2);
    expect(indexAtDistance(stream, 999)).toBe(4);
  });

  it("clamps past the end of the stream", () => {
    expect(indexAtDistance(stream, 5000)).toBe(4);
  });
});
