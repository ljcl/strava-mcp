/**
 * One structured payload per tool group (#243), driven through
 * `dispatchToolCall` — the path a host actually takes — and validated against
 * the schema each tool advertises. Before this, these tools rendered ids into
 * prose like `(ID: 123)` and a caller had to regex them back out to chain.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivity,
  getActivityPhotos,
  getActivityZones,
  getAuthenticatedAthlete,
  getRouteById,
  getSegmentById,
  getSegmentEffort,
  listAthleteRoutes,
  listSegmentEfforts,
  listStarredSegments,
  starSegment,
  updateActivity,
} from "../stravaClient";
import {
  ActivityPhotosOutputSchema,
  ActivityWriteOutputSchema,
  ActivityZonesOutputSchema,
  RouteOutputSchema,
  RoutesOutputSchema,
  SegmentEffortOutputSchema,
  SegmentEffortsOutputSchema,
  SegmentListOutputSchema,
  SegmentOutputSchema,
  StarSegmentOutputSchema,
} from "./outputs";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return {
    ...actual,
    getAuthenticatedAthlete: vi.fn(),
    getSegmentById: vi.fn(),
    listStarredSegments: vi.fn(),
    getSegmentEffort: vi.fn(),
    listSegmentEfforts: vi.fn(),
    getRouteById: vi.fn(),
    listAthleteRoutes: vi.fn(),
    getActivityZones: vi.fn(),
    getActivityPhotos: vi.fn(),
    starSegment: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
  };
});

vi.mock("../tokenManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tokenManager")>();
  return { ...actual, getStravaToken: vi.fn(async () => "test-token") };
});

const { dispatchToolCall } = await import("../server");

const segment = {
  id: "229781",
  name: "Hawk Hill",
  activity_type: "Ride",
  distance: 2684.82,
  average_grade: 5.7,
  maximum_grade: 14.2,
  elevation_high: 245.3,
  elevation_low: 92.4,
  total_elevation_gain: 155.7,
  climb_category: 1,
  city: "San Francisco",
  state: "CA",
  country: "United States",
  private: false,
  starred: true,
  effort_count: 309974,
  athlete_count: 30623,
  star_count: 3280,
  created_at: "2009-09-21T20:29:41Z",
};

const effort = {
  id: "1234556789",
  name: "Hawk Hill",
  segment: { id: "229781", name: "Hawk Hill" },
  activity: { id: "1122334455" },
  // The text formatter prints the athlete id too, so the fixture carries it.
  athlete: { id: "42" },
  start_date_local: "2026-06-01T07:12:00Z",
  elapsed_time: 704,
  moving_time: 700,
  distance: 2684.82,
  average_heartrate: 158.2,
  average_watts: 271.4,
  average_cadence: 84.1,
  pr_rank: 1,
  kom_rank: null,
};

const route = {
  id: "3516039180561708486",
  name: "Bay Loop",
  type: 1,
  sub_type: 2,
  distance: 45123.4,
  elevation_gain: 512.7,
  estimated_moving_time: 7200,
  private: false,
  starred: true,
  created_at: "2026-01-04T10:00:00Z",
  description: "Flat coastal spin",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedAthlete).mockResolvedValue({
    measurement_preference: "meters",
  } as never);
});

describe("segment tools", () => {
  it("get-segment returns the segment as data, not just prose", async () => {
    vi.mocked(getSegmentById).mockResolvedValueOnce(segment as never);

    const result = await dispatchToolCall("get-segment", {
      segmentId: "229781",
    });

    const structured = SegmentOutputSchema.parse(result.structuredContent);
    expect(structured).toMatchObject({
      id: "229781",
      name: "Hawk Hill",
      distance_m: 2684.82,
      average_grade_pct: 5.7,
      climb_category: 1,
      starred: true,
      effort_count: 309974,
    });
    // The text rendering is unchanged.
    expect(result.content[0]?.text).toContain("Hawk Hill");
  });

  it("list-starred-segments reports the page and whether more exist", async () => {
    vi.mocked(listStarredSegments).mockResolvedValueOnce([segment] as never);

    const result = await dispatchToolCall("list-starred-segments", {
      page: 2,
      perPage: 1,
    });

    const structured = SegmentListOutputSchema.parse(result.structuredContent);
    expect(structured.count).toBe(1);
    expect(structured.page).toBe(2);
    // A full page came back, so Strava may hold more (#246).
    expect(structured.has_more).toBe(true);
    expect(structured.segments[0]!.id).toBe("229781");
  });

  it("list-starred-segments still validates when the page is empty", async () => {
    vi.mocked(listStarredSegments).mockResolvedValueOnce([] as never);

    const result = await dispatchToolCall("list-starred-segments", {});

    const structured = SegmentListOutputSchema.parse(result.structuredContent);
    expect(structured).toMatchObject({ count: 0, has_more: false });
  });

  it("star-segment reports the state after the write", async () => {
    vi.mocked(starSegment).mockResolvedValueOnce({
      id: "229781",
      name: "Hawk Hill",
      starred: false,
    } as never);

    const result = await dispatchToolCall("star-segment", {
      segmentId: "229781",
      starred: false,
    });

    expect(StarSegmentOutputSchema.parse(result.structuredContent)).toEqual({
      segment_id: "229781",
      name: "Hawk Hill",
      starred: false,
    });
  });
});

describe("segment effort tools", () => {
  it("get-segment-effort exposes the ids a caller would otherwise regex out", async () => {
    vi.mocked(getSegmentEffort).mockResolvedValueOnce(effort as never);

    const result = await dispatchToolCall("get-segment-effort", {
      effortId: "1234556789",
    });

    const structured = SegmentEffortOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured).toMatchObject({
      id: "1234556789",
      segment_id: "229781",
      activity_id: "1122334455",
      elapsed_time_s: 704,
      pr_rank: 1,
      kom_rank: null,
    });
  });

  it("list-segment-efforts returns the efforts under their segment", async () => {
    vi.mocked(listSegmentEfforts).mockResolvedValueOnce([effort] as never);

    const result = await dispatchToolCall("list-segment-efforts", {
      segmentId: "229781",
    });

    const structured = SegmentEffortsOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured.segment_id).toBe("229781");
    expect(structured.count).toBe(1);
    expect(structured.efforts[0]!.average_heartrate).toBe(158.2);
  });
});

describe("route tools", () => {
  it("get-route returns the route as data", async () => {
    vi.mocked(getRouteById).mockResolvedValueOnce(route as never);

    const result = await dispatchToolCall("get-route", {
      routeId: "3516039180561708486",
    });

    const structured = RouteOutputSchema.parse(result.structuredContent);
    expect(structured).toMatchObject({
      // The 64-bit id survives as digits, as everywhere else (#282).
      id: "3516039180561708486",
      name: "Bay Loop",
      distance_m: 45123.4,
      description: "Flat coastal spin",
    });
  });

  it("list-athlete-routes pages like the starred segments list", async () => {
    vi.mocked(listAthleteRoutes).mockResolvedValueOnce([route] as never);

    const result = await dispatchToolCall("list-athlete-routes", {
      page: 1,
      perPage: 1,
    });

    const structured = RoutesOutputSchema.parse(result.structuredContent);
    expect(structured).toMatchObject({ count: 1, page: 1, has_more: true });
  });
});

describe("activity read tools", () => {
  it("get-activity-zones publishes the same buckets the chart draws", async () => {
    vi.mocked(getActivityZones).mockResolvedValueOnce([
      {
        type: "heartrate",
        sensor_based: true,
        distribution_buckets: [
          { min: 0, max: 120, time: 600 },
          { min: 120, max: -1, time: 400 },
        ],
      },
    ] as never);

    const result = await dispatchToolCall("get-activity-zones", {
      id: "1122334455",
    });

    const structured = ActivityZonesOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured.zone_sets).toHaveLength(1);
    const set = structured.zone_sets[0]!;
    expect(set.type).toBe("heartrate");
    expect(set.total_seconds).toBe(1000);
    // Strava's -1 open-ended top bucket is normalised, as in the app mapper.
    expect(set.buckets[1]!.max).toBeNull();
    expect(set.buckets[0]!.pct).toBe(60);
  });

  it("get-activity-photos picks the largest URL per photo", async () => {
    vi.mocked(getActivityPhotos).mockResolvedValueOnce([
      {
        id: 1,
        unique_id: "abc",
        caption: "Summit",
        urls: { "100": "small.jpg", "2048": "large.jpg" },
        created_at: "2026-06-01T07:30:00Z",
        location: [-37.8, 144.9],
      },
    ] as never);

    const result = await dispatchToolCall("get-activity-photos", {
      id: "1122334455",
    });

    const structured = ActivityPhotosOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured.count).toBe(1);
    expect(structured.photos[0]!.url).toBe("large.jpg");
    expect(structured.photos[0]!.location).toEqual([-37.8, 144.9]);
  });
});

describe("activity write tools", () => {
  const written = {
    id: "9001",
    name: "Morning Yoga",
    sport_type: "Yoga",
    start_date_local: "2026-07-13T07:30:00Z",
    distance: 0,
    elapsed_time: 1800,
    description: null,
    gear_id: null,
    commute: false,
    trainer: false,
  };

  it("create-activity returns the created activity and its URL", async () => {
    vi.mocked(createActivity).mockResolvedValueOnce(written as never);

    const result = await dispatchToolCall("create-activity", {
      name: "Morning Yoga",
      sportType: "Yoga",
      startDateLocal: "2026-07-13T07:30:00",
      elapsedTimeSeconds: 1800,
    });

    const structured = ActivityWriteOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured).toMatchObject({
      activity_id: "9001",
      sport_type: "Yoga",
      elapsed_time_s: 1800,
      url: "https://www.strava.com/activities/9001",
    });
  });

  it("update-activity returns the activity as Strava echoed it back", async () => {
    vi.mocked(updateActivity).mockResolvedValueOnce({
      ...written,
      name: "Renamed",
      description: "Felt strong",
    } as never);

    const result = await dispatchToolCall("update-activity", {
      activityId: "9001",
      name: "Renamed",
    });

    const structured = ActivityWriteOutputSchema.parse(
      result.structuredContent,
    );
    expect(structured.name).toBe("Renamed");
    expect(structured.description).toBe("Felt strong");
  });
});
