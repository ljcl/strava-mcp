import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRouteProfile } from "./routeProfile";
import {
  getActivityById,
  getActivityStreams,
  getRouteById,
  type StravaDetailedActivity,
  type StravaRoute,
  StreamsUnavailableError,
} from "./stravaClient";
import { loadTrackGeometry } from "./trackGeometry";

vi.mock("./stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stravaClient")>();
  return {
    ...actual,
    getActivityById: vi.fn(),
    getActivityStreams: vi.fn(),
    getRouteById: vi.fn(),
  };
});
vi.mock("./routeProfile", () => ({ loadRouteProfile: vi.fn() }));

const mockedActivity = vi.mocked(getActivityById);
const mockedStreams = vi.mocked(getActivityStreams);
const mockedRoute = vi.mocked(getRouteById);
const mockedProfile = vi.mocked(loadRouteProfile);

// Google's polyline example: three points near (38.5, -120.2).
const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const activity = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "123",
    name: "Sunday Long Run",
    type: "Run",
    sport_type: "TrailRun",
    distance: 21000,
    map: { summary_polyline: POLYLINE },
    ...overrides,
  }) as unknown as StravaDetailedActivity;

const route = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "9",
    name: "River Loop",
    type: 2,
    distance: 5000,
    map: { summary_polyline: POLYLINE },
    ...overrides,
  }) as unknown as StravaRoute;

describe("loadTrackGeometry", () => {
  beforeEach(() => {
    mockedActivity.mockReset();
    mockedStreams.mockReset();
    mockedRoute.mockReset();
    mockedProfile.mockReset();
  });

  it("requires one of the two ids", async () => {
    await expect(loadTrackGeometry("token", {})).rejects.toThrow(
      /Provide either activity_id or route_id/,
    );
  });

  it("prefers an activity's latlng stream and its recorded distance", async () => {
    mockedActivity.mockResolvedValueOnce(activity());
    mockedStreams.mockResolvedValueOnce(
      new Map<string, unknown[]>([
        [
          "latlng",
          [
            [1, 2],
            [1.1, 2],
          ],
        ],
        ["distance", [0, 111]],
      ]),
    );

    const track = await loadTrackGeometry("token", { activityId: "123" });

    expect(track.source).toBe("activity");
    expect(track.coordinates).toHaveLength(2);
    expect(track.distances).toEqual([0, 111]);
    expect(track.distanceSource).toBe("stream");
    expect(track.activityType).toBe("TrailRun");
  });

  it("derives distances when the stream is missing or misaligned", async () => {
    mockedActivity.mockResolvedValueOnce(activity());
    mockedStreams.mockResolvedValueOnce(
      new Map<string, unknown[]>([
        [
          "latlng",
          [
            [-37.8, 144.9],
            [-37.799, 144.9],
          ],
        ],
        ["distance", [0]],
      ]),
    );

    const track = await loadTrackGeometry("token", { activityId: "123" });

    expect(track.distanceSource).toBe("haversine");
    expect(track.distances[1]).toBeGreaterThan(100);
  });

  it("falls back to the polyline for a stream-less activity", async () => {
    mockedActivity.mockResolvedValueOnce(activity());
    mockedStreams.mockRejectedValueOnce(new StreamsUnavailableError("123"));

    const track = await loadTrackGeometry("token", { activityId: "123" });

    expect(track.coordinates).toHaveLength(3);
    expect(track.distanceSource).toBe("haversine");
  });

  it("propagates a real stream failure rather than silently coarsening", async () => {
    mockedActivity.mockResolvedValueOnce(activity());
    mockedStreams.mockRejectedValueOnce(
      new Error("Strava rate limit exceeded in getActivityStreams."),
    );

    await expect(
      loadTrackGeometry("token", { activityId: "123" }),
    ).rejects.toThrow(/rate limit/);
  });

  it("carries an activity's own segment efforts", async () => {
    mockedActivity.mockResolvedValueOnce(
      activity({
        segment_efforts: [
          {
            name: "Church Street",
            elapsed_time: 245,
            pr_rank: 1,
            kom_rank: null,
            segment: { id: "s1" },
          },
        ],
      }),
    );
    mockedStreams.mockRejectedValueOnce(new StreamsUnavailableError("123"));

    const track = await loadTrackGeometry("token", { activityId: "123" });

    expect(track.efforts).toEqual([
      {
        segmentId: "s1",
        name: "Church Street",
        elapsedTime: 245,
        prRank: 1,
        komRank: null,
      },
    ]);
  });

  it("uses a route's stored profile geometry when it has one", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce({
      source: "streams",
      coordinates: [
        [1, 2],
        [1.1, 2],
        [1.2, 2],
      ],
      distance: [0, 111, 222],
      altitude: [10, 20, 30],
    });

    const track = await loadTrackGeometry("token", { routeId: "9" });

    expect(track.source).toBe("route");
    expect(track.activityType).toBe("Run");
    expect(track.coordinates).toHaveLength(3);
    expect(track.distances).toEqual([0, 111, 222]);
    expect(track.distanceSource).toBe("stream");
    expect(track.efforts).toEqual([]);
  });

  it("falls back to a route's polyline when it has no profile", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce(null);

    const track = await loadTrackGeometry("token", { routeId: "9" });

    expect(track.coordinates).toHaveLength(3);
    expect(track.distanceSource).toBe("haversine");
  });

  it("labels a ride route by Strava's type enum", async () => {
    mockedRoute.mockResolvedValueOnce(route({ type: 1 }));
    mockedProfile.mockResolvedValueOnce(null);

    expect(
      (await loadTrackGeometry("token", { routeId: "9" })).activityType,
    ).toBe("Ride");
  });
});
