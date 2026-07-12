import { describe, expect, it } from "vitest";
import { buildGpx } from "./gpxBuilder";

const coordinates: Array<[number, number]> = [
  [-37.8136, 144.9631],
  [-37.8137, 144.9635],
  [-37.8139, 144.964],
];

describe("buildGpx", () => {
  it("builds a full track with timestamps, elevation, and sensor extensions", () => {
    const gpx = buildGpx({
      name: "Morning Run",
      activityType: "Run",
      startDate: "2026-07-01T06:00:00Z",
      coordinates,
      time: [0, 5, 11],
      altitude: [30.2, 30.8, 31.4],
      heartrate: [140, 142.6, 145],
      cadence: [86, 87, 88],
    });

    expect(gpx).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(gpx).toContain(`xmlns="http://www.topografix.com/GPX/1/1"`);
    expect(gpx).toContain("xmlns:gpxtpx=");
    expect(gpx).toContain(
      "<metadata><time>2026-07-01T06:00:00.000Z</time></metadata>",
    );
    expect(gpx).toContain("<name>Morning Run</name>");
    expect(gpx).toContain("<type>Run</type>");
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain(`<trkpt lat="-37.8136" lon="144.9631">`);
    expect(gpx).toContain("<ele>30.2</ele>");
    // time stream offsets from start_date
    expect(gpx).toContain("<time>2026-07-01T06:00:05.000Z</time>");
    expect(gpx).toContain("<time>2026-07-01T06:00:11.000Z</time>");
    // HR rounded, cadence in the same TrackPointExtension
    expect(gpx).toContain("<gpxtpx:hr>143</gpxtpx:hr>");
    expect(gpx).toContain("<gpxtpx:cad>87</gpxtpx:cad>");
  });

  it("omits timestamps entirely without a time stream (polyline fallback)", () => {
    const gpx = buildGpx({
      name: "Old Ride",
      activityType: "Ride",
      startDate: "2026-07-01T06:00:00Z",
      coordinates,
    });

    expect(gpx).not.toContain("<time>");
    expect(gpx).not.toContain("<metadata>");
    expect(gpx).not.toContain("gpxtpx");
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
  });

  it("emits heart rate without cadence when only HR exists", () => {
    const gpx = buildGpx({
      name: "Tempo",
      coordinates,
      heartrate: [150, 151, 152],
    });

    expect(gpx).toContain("<gpxtpx:hr>150</gpxtpx:hr>");
    expect(gpx).not.toContain("gpxtpx:cad");
  });

  it("skips per-point fields where a stream has no value at that index", () => {
    const gpx = buildGpx({
      name: "Patchy",
      startDate: "2026-07-01T06:00:00Z",
      coordinates,
      time: [0, 5], // shorter than coordinates
      altitude: [30],
    });

    // Third point has neither ele nor time.
    const points = gpx.split("<trkpt ");
    expect(points[3]).not.toContain("<ele>");
    expect(points[3]).not.toContain("<time>");
    // First point has both.
    expect(points[1]).toContain("<ele>30</ele>");
    expect(points[1]).toContain("<time>2026-07-01T06:00:00.000Z</time>");
  });

  it("escapes XML-hostile characters in the activity name", () => {
    const gpx = buildGpx({
      name: `Bill's "<epic>" ride & more`,
      coordinates,
    });

    expect(gpx).toContain(
      "<name>Bill&apos;s &quot;&lt;epic&gt;&quot; ride &amp; more</name>",
    );
    expect(gpx).not.toContain("<epic>");
  });
});
