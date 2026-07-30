import { describe, expect, it } from "vitest";
import { parseGpxTrackPoints } from "./gpxTrackPoints";

const gpx = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StravaGPX"><trk><name>Loop</name><trkseg>${body}</trkseg></trk></gpx>`;

describe("parseGpxTrackPoints", () => {
  it("reads lat, lon, and elevation in document order", () => {
    const points = parseGpxTrackPoints(
      gpx(`
        <trkpt lat="-37.8136" lon="144.9631"><ele>12.4</ele></trkpt>
        <trkpt lat="-37.8140" lon="144.9640"><ele>18.0</ele></trkpt>
      `),
    );

    expect(points).toEqual([
      { lat: -37.8136, lng: 144.9631, ele: 12.4 },
      { lat: -37.814, lng: 144.964, ele: 18 },
    ]);
  });

  it("keeps a point whose elevation is missing, with a null", () => {
    const points = parseGpxTrackPoints(
      gpx(`
        <trkpt lat="1" lon="2"><ele>5</ele></trkpt>
        <trkpt lat="1.1" lon="2.1"><time>2026-01-01T00:00:00Z</time></trkpt>
      `),
    );

    expect(points.map((p) => p.ele)).toEqual([5, null]);
  });

  it("handles self-closing track points", () => {
    const points = parseGpxTrackPoints(
      gpx(`<trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/>`),
    );

    expect(points).toEqual([
      { lat: 1, lng: 2, ele: null },
      { lat: 3, lng: 4, ele: null },
    ]);
  });

  it("reads negative and exponent-notation elevations", () => {
    const points = parseGpxTrackPoints(
      gpx(`
        <trkpt lat="1" lon="2"><ele>-3.5</ele></trkpt>
        <trkpt lat="1" lon="2"><ele>1.2e2</ele></trkpt>
      `),
    );

    expect(points.map((p) => p.ele)).toEqual([-3.5, 120]);
  });

  it("skips a point with unusable coordinates", () => {
    const points = parseGpxTrackPoints(
      gpx(`<trkpt lat="oops" lon="2"><ele>5</ele></trkpt>`),
    );

    expect(points).toEqual([]);
  });

  it("tolerates extra attributes and whitespace", () => {
    const points = parseGpxTrackPoints(
      gpx(`<trkpt  lon = "2"   lat = "1" >\n  <ele> 7.25 </ele>\n</trkpt>`),
    );

    expect(points).toEqual([{ lat: 1, lng: 2, ele: 7.25 }]);
  });

  it("returns nothing for a track-less document", () => {
    expect(parseGpxTrackPoints(gpx(""))).toEqual([]);
    expect(parseGpxTrackPoints("not xml at all")).toEqual([]);
  });

  // The regex literal is module-level with /g, so a stale lastIndex between
  // calls would silently drop the first points of every second parse.
  it("does not carry state between calls", () => {
    const doc = gpx(`<trkpt lat="1" lon="2"><ele>5</ele></trkpt>`);

    expect(parseGpxTrackPoints(doc)).toHaveLength(1);
    expect(parseGpxTrackPoints(doc)).toHaveLength(1);
  });
});
