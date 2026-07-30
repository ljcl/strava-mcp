/**
 * #264: a saved route's elevation, from its stored streams when it has them and
 * from its GPX export when it does not. The fallback is the point — routes saved
 * before Strava stored profiles 404 on `/routes/{id}/streams` — and so is the
 * boundary around it: only a genuinely profile-less route may degrade.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "./fetchClient";
import { loadRouteProfile } from "./routeProfile";
import {
  exportRouteGpx,
  getRouteStreams,
  type StravaStreamSet,
  StreamsUnavailableError,
} from "./stravaClient";

vi.mock("./stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stravaClient")>();
  return { ...actual, getRouteStreams: vi.fn(), exportRouteGpx: vi.fn() };
});

const mockedStreams = vi.mocked(getRouteStreams);
const mockedGpx = vi.mocked(exportRouteGpx);

const streamSet = (entries: Record<string, unknown[]>): StravaStreamSet =>
  new Map(Object.entries(entries));

const gpxWithElevation = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="-37.8000" lon="144.9000"><ele>10</ele></trkpt>
  <trkpt lat="-37.8010" lon="144.9000"><ele>20</ele></trkpt>
  <trkpt lat="-37.8020" lon="144.9000"><ele>15</ele></trkpt>
</trkseg></trk></gpx>`;

const notFound = () =>
  new HttpError("HTTP 404", {
    status: 404,
    statusText: "Not Found",
    data: "Record Not Found",
  });

describe("loadRouteProfile", () => {
  beforeEach(() => {
    mockedStreams.mockReset();
    mockedGpx.mockReset();
  });

  it("uses the stored streams when the route has them", async () => {
    mockedStreams.mockResolvedValueOnce(
      streamSet({
        distance: [0, 100, 200],
        altitude: [10, 20, 30],
        latlng: [
          [1, 2],
          [1.1, 2],
          [1.2, 2],
        ],
      }),
    );

    const profile = await loadRouteProfile("token", "456");

    expect(profile?.source).toBe("streams");
    expect(profile?.distance).toEqual([0, 100, 200]);
    expect(profile?.altitude).toEqual([10, 20, 30]);
    expect(profile?.coordinates).toHaveLength(3);
    expect(mockedGpx).not.toHaveBeenCalled();
  });

  it("synthesises distance from the geometry when only altitude is stored", async () => {
    mockedStreams.mockResolvedValueOnce(
      streamSet({
        altitude: [10, 20],
        latlng: [
          [-37.8, 144.9],
          [-37.801, 144.9],
        ],
      }),
    );

    const profile = await loadRouteProfile("token", "456");

    expect(profile?.source).toBe("streams");
    // ~111 m per 0.001° of latitude.
    expect(profile?.distance[1]).toBeGreaterThan(100);
    expect(profile?.distance[1]).toBeLessThan(120);
  });

  it("drops coordinates that do not align with the elevation", async () => {
    mockedStreams.mockResolvedValueOnce(
      streamSet({
        distance: [0, 100, 200],
        altitude: [10, 20, 30],
        latlng: [[1, 2]],
      }),
    );

    const profile = await loadRouteProfile("token", "456");

    // Misaligned geometry would colour the wrong part of the track.
    expect(profile?.coordinates).toEqual([]);
    expect(profile?.altitude).toHaveLength(3);
  });

  it("falls back to the GPX export for a route with no stored profile", async () => {
    mockedStreams.mockRejectedValueOnce(
      new StreamsUnavailableError("456", "route"),
    );
    mockedGpx.mockResolvedValueOnce(gpxWithElevation);

    const profile = await loadRouteProfile("token", "456");

    expect(profile?.source).toBe("gpx");
    expect(profile?.altitude).toEqual([10, 20, 15]);
    expect(profile?.coordinates).toHaveLength(3);
    expect(profile?.distance[0]).toBe(0);
    expect(profile?.distance[2]).toBeGreaterThan(0);
  });

  it("returns null when the GPX export carries no elevation", async () => {
    mockedStreams.mockRejectedValueOnce(
      new StreamsUnavailableError("456", "route"),
    );
    mockedGpx.mockResolvedValueOnce(
      `<gpx><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg></trk></gpx>`,
    );

    expect(await loadRouteProfile("token", "456")).toBeNull();
  });

  it("returns null when the GPX export itself is not found", async () => {
    mockedStreams.mockRejectedValueOnce(
      new StreamsUnavailableError("456", "route"),
    );
    mockedGpx.mockRejectedValueOnce(notFound());

    expect(await loadRouteProfile("token", "456")).toBeNull();
  });

  it("propagates a rate-limit failure rather than reporting a flat route", async () => {
    mockedStreams.mockRejectedValueOnce(
      new Error("Strava rate limit exceeded in getRouteStreams for ID 456."),
    );

    await expect(loadRouteProfile("token", "456")).rejects.toThrow(
      /rate limit/,
    );
    expect(mockedGpx).not.toHaveBeenCalled();
  });

  it("propagates a GPX-export failure that is not a 404", async () => {
    mockedStreams.mockRejectedValueOnce(
      new StreamsUnavailableError("456", "route"),
    );
    mockedGpx.mockRejectedValueOnce(new Error("Strava authentication failed"));

    await expect(loadRouteProfile("token", "456")).rejects.toThrow(
      /authentication/,
    );
  });

  it("falls back when the stored altitude stream is too short to profile", async () => {
    mockedStreams.mockResolvedValueOnce(
      streamSet({ distance: [0], altitude: [10] }),
    );
    mockedGpx.mockResolvedValueOnce(gpxWithElevation);

    expect((await loadRouteProfile("token", "456"))?.source).toBe("gpx");
  });
});
