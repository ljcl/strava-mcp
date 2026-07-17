/**
 * Success and error paths for the MCP App tool handlers in server.ts (#115).
 * Table-driven through dispatchToolCall — the same path the host uses — with
 * the Strava client mocked. The missing-token table pins the regression where
 * those early returns lacked `isError: true` and surfaced as ordinary content.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaApi } from "./fetchClient";
import {
  getActivityById,
  getActivityLaps,
  getActivityPhotos,
  getActivityZones,
  getAllActivities,
  getRouteById,
  type StravaActivityZone,
  type StravaDetailedActivity,
  type StravaLap,
  type StravaRoute,
  type StravaSummaryActivity,
} from "./stravaClient";

vi.mock("./stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stravaClient")>();
  return {
    ...actual,
    getActivityById: vi.fn(),
    getActivityLaps: vi.fn(),
    getActivityPhotos: vi.fn(),
    getActivityZones: vi.fn(),
    getAllActivities: vi.fn(),
    getRouteById: vi.fn(),
  };
});

vi.mock("./fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchClient")>();
  return {
    ...actual,
    stravaApi: { get: vi.fn() },
  };
});

// Import after the mocks so server.ts's modules see the mocked client.
const { dispatchToolCall } = await import("./server");

const mockedById = vi.mocked(getActivityById);
const mockedLaps = vi.mocked(getActivityLaps);
const mockedZones = vi.mocked(getActivityZones);
const mockedPhotos = vi.mocked(getActivityPhotos);
const mockedList = vi.mocked(getAllActivities);
const mockedRoute = vi.mocked(getRouteById);
const mockedApiGet = vi.mocked(stravaApi.get);

// Google's polyline example: three points near (38.5, -120.2).
const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

function detailedActivity(
  overrides: Record<string, unknown> = {},
): StravaDetailedActivity {
  return {
    id: "123",
    name: "Morning Run",
    type: "Run",
    sport_type: "Run",
    start_date: "2026-06-01T07:00:00Z",
    start_date_local: "2026-06-01T07:00:00Z",
    distance: 10000,
    moving_time: 3000,
    total_elevation_gain: 120,
    average_speed: 3.33,
    average_heartrate: 150,
    map: { summary_polyline: POLYLINE },
    ...overrides,
  } as unknown as StravaDetailedActivity;
}

function summaryRun(
  overrides: Record<string, unknown> = {},
): StravaSummaryActivity {
  return {
    id: "1",
    name: "Easy Run",
    type: "Run",
    sport_type: "Run",
    start_date: "2026-06-01T07:00:00Z",
    start_date_local: "2026-06-01T07:00:00Z",
    distance: 8000,
    moving_time: 2400,
    average_cadence: 42.5,
    average_speed: 3.33,
    total_elevation_gain: 60,
    ...overrides,
  } as unknown as StravaSummaryActivity;
}

beforeEach(() => {
  process.env.STRAVA_ACCESS_TOKEN = "test-token";
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.STRAVA_ACCESS_TOKEN;
});

/** Every app tool with args that pass its input schema. */
const APP_TOOL_CALLS: Array<[string, Record<string, unknown>]> = [
  ["view-activity-chart", { activity_id: "123" }],
  ["get-activity-streams-raw", { activity_id: "123" }],
  ["view-cadence-trends", {}],
  ["get-cadence-trend-data", {}],
  ["view-route-map", { activity_id: "123" }],
  ["get-route-map-data", { activity_id: "123" }],
  ["view-activity-segments", { activity_id: "123" }],
  ["get-activity-segments-data", { activity_id: "123" }],
  ["view-training-load", {}],
  ["get-training-load-data", {}],
  ["view-activity-zones", { activity_id: "123" }],
  ["get-activity-zones-data", { activity_id: "123" }],
  ["view-compare-activities", { activity_id_1: "1", activity_id_2: "2" }],
  ["get-compare-activities-data", { activity_id_1: "1", activity_id_2: "2" }],
];

describe("app handlers without STRAVA_ACCESS_TOKEN", () => {
  it.each(APP_TOOL_CALLS)(
    "%s returns isError: true instead of plain content",
    async (name, args) => {
      delete process.env.STRAVA_ACCESS_TOKEN;

      const result = await dispatchToolCall(name, args);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Missing STRAVA_ACCESS_TOKEN");
    },
  );
});

describe("view-activity-chart", () => {
  it("summarises the activity for the model", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());

    const result = await dispatchToolCall("view-activity-chart", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Activity: Morning Run");
    expect(text).toContain("Distance: 10.00 km");
    expect(mockedById).toHaveBeenCalledWith("test-token", 123);
  });

  it("surfaces a Strava failure as a structured tool error", async () => {
    mockedById.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await dispatchToolCall("view-activity-chart", {
      activity_id: "123",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Record Not Found");
  });
});

describe("get-activity-streams-raw", () => {
  it("returns streams keyed by type plus mapped laps", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedApiGet.mockResolvedValueOnce({
      data: [
        { type: "time", data: [0, 1, 2] },
        { type: "heartrate", data: [140, 150, 160] },
      ],
    } as never);
    mockedLaps.mockResolvedValueOnce([
      {
        name: "Lap 1",
        start_index: 0,
        end_index: 2,
        distance: 1000,
        elapsed_time: 300,
        moving_time: 290,
        average_speed: 3.3,
        average_heartrate: 152,
        lap_index: 1,
      } as unknown as StravaLap,
    ]);

    const result = await dispatchToolCall("get-activity-streams-raw", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.activityId).toBe(123);
    expect(parsed.streams.heartrate).toEqual([140, 150, 160]);
    expect(parsed.laps).toEqual([
      {
        name: "Lap 1",
        startIndex: 0,
        endIndex: 2,
        distance: 1000,
        elapsedTime: 300,
        averageSpeed: 3.3,
        averageHeartrate: 152,
        lapIndex: 1,
      },
    ]);
  });

  it("returns isError when the stream fetch fails", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedApiGet.mockRejectedValueOnce(new Error("Rate limited"));
    mockedLaps.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-activity-streams-raw", {
      activity_id: "123",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Rate limited");
  });
});

describe("cadence trends handlers", () => {
  it("view-cadence-trends reports run count and doubled cadence", async () => {
    mockedList.mockResolvedValueOnce([
      summaryRun(),
      summaryRun({ id: "2", type: "Ride" }), // filtered out
    ]);

    const result = await dispatchToolCall("view-cadence-trends", { weeks: 4 });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Cadence Trends (last 4 weeks)");
    expect(text).toContain("Runs: 1");
    expect(text).toContain("Average cadence: 85 spm");
  });

  it("get-cadence-trend-data maps runs to per-activity summaries", async () => {
    mockedList.mockResolvedValueOnce([summaryRun()]);

    const result = await dispatchToolCall("get-cadence-trend-data", {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.weeks).toBe(6);
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0]).toMatchObject({
      id: "1",
      name: "Easy Run",
      distance: 8,
      averageCadence: 85,
    });
  });
});

describe("training load handlers", () => {
  it("view-training-load summarises totals and warning weeks", async () => {
    mockedList.mockResolvedValueOnce([summaryRun()]);

    const result = await dispatchToolCall("view-training-load", {});

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Training Load (last 84 days)");
    expect(text).toContain("Runs: 1");
    expect(text).toContain("Distance: 8 km");
  });

  it("get-training-load-data returns the weekly aggregation", async () => {
    mockedList.mockResolvedValueOnce([summaryRun()]);

    const result = await dispatchToolCall("get-training-load-data", {
      days: 84,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.days).toBe(84);
    expect(parsed.totals.runs).toBe(1);
    expect(parsed.weeks.length).toBeGreaterThan(0);
  });
});

describe("route map handlers", () => {
  it("view-route-map decodes an activity polyline", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());

    const result = await dispatchToolCall("view-route-map", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Activity: Morning Run");
    expect(text).toContain("Distance: 10.00 km");
    expect(text).not.toContain("No GPS track");
  });

  it("view-route-map maps a saved route by route_id", async () => {
    mockedRoute.mockResolvedValueOnce({
      id: "9",
      name: "River Loop",
      type: 2,
      distance: 5000,
      elevation_gain: 50,
      created_at: "2026-01-01T00:00:00Z",
      map: { summary_polyline: POLYLINE },
    } as unknown as StravaRoute);

    const result = await dispatchToolCall("view-route-map", {
      route_id: "9",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Route: River Loop");
    expect(mockedRoute).toHaveBeenCalledWith("test-token", "9");
  });

  it("view-route-map flags an empty track", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity({ map: {} }));

    const result = await dispatchToolCall("view-route-map", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No GPS track is available");
  });

  it("get-route-map-data prefers latlng streams and resolves annotations", async () => {
    const coords: Array<[number, number]> = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    mockedById.mockResolvedValueOnce(
      detailedActivity({
        segment_efforts: [
          {
            name: "Sprint",
            distance: 400,
            elapsed_time: 60,
            moving_time: 60,
            pr_rank: 1,
            kom_rank: null,
            segment: {
              id: 77,
              start_latlng: coords[0],
              end_latlng: coords[2],
            },
          },
        ],
      }),
    );
    mockedApiGet.mockResolvedValueOnce({
      data: [
        { type: "latlng", data: coords },
        { type: "distance", data: [0, 5000, 10000] },
      ],
    } as never);
    mockedLaps.mockResolvedValueOnce([]);
    mockedPhotos.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.source).toBe("activity");
    expect(parsed.coordinates).toEqual(coords);
    expect(parsed.streams.distance).toEqual([0, 5000, 10000]);
    expect(parsed.annotations.segments).toEqual([
      {
        name: "Sprint",
        startIndex: 0,
        endIndex: 2,
        distanceMeters: 400,
        isPr: true,
        isTop10: false,
      },
    ]);
  });

  it("get-route-map-data falls back to the polyline when streams fail", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedApiGet.mockRejectedValueOnce(new Error("no streams"));

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.coordinates).toHaveLength(3);
    expect(parsed.streams).toBeUndefined();
  });

  it("get-route-map-data anchors waypoints on the distance stream and drops out-of-range ones", async () => {
    const coords: Array<[number, number]> = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedApiGet.mockResolvedValueOnce({
      data: [
        { type: "latlng", data: coords },
        { type: "distance", data: [0, 5000, 10000] },
      ],
    } as never);
    mockedLaps.mockResolvedValueOnce([]);
    mockedPhotos.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
      waypoints: [
        { km: 4, label: "Gel 1", kind: "fuel" },
        { km: 42, label: "Botanic Gardens climb", kind: "climb" },
        { km: 8, label: "Water stop" }, // kind defaults to custom
      ],
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.annotations.waypoints).toEqual([
      { km: 4, label: "Gel 1", kind: "fuel", index: 1 },
      { km: 8, label: "Water stop", kind: "custom", index: 2 },
    ]);
    expect(parsed.waypointWarnings).toHaveLength(1);
    expect(parsed.waypointWarnings[0]).toContain("Botanic Gardens climb");
    expect(parsed.waypointWarnings[0]).toContain("10.0 km");
  });

  it("get-route-map-data anchors route waypoints via haversine cumulative distance", async () => {
    mockedRoute.mockResolvedValueOnce({
      id: "9",
      name: "River Loop",
      type: 2,
      distance: 600000,
      elevation_gain: 50,
      created_at: "2026-01-01T00:00:00Z",
      map: { summary_polyline: POLYLINE },
    } as unknown as StravaRoute);

    const result = await dispatchToolCall("get-route-map-data", {
      route_id: "9",
      waypoints: [{ km: 100, label: "Halfway fuel", kind: "fuel" }],
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    // The polyline's first leg is ~250 km, so a 100 km waypoint anchors to
    // the second point of the decoded track.
    expect(parsed.annotations.waypoints).toEqual([
      { km: 100, label: "Halfway fuel", kind: "fuel", index: 1 },
    ]);
    expect(parsed.waypointWarnings).toBeUndefined();
  });

  it("view-route-map reports pinned waypoints and warns about dropped ones", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());

    const result = await dispatchToolCall("view-route-map", {
      activity_id: "123",
      waypoints: [
        { km: 5, label: "Gel 1", kind: "fuel" },
        { km: 42.2, label: "Finish gel", kind: "fuel" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Waypoints: 1 pinned");
    expect(text).toContain("Warning: Dropped 1 waypoint");
    expect(text).toContain('"Finish gel" (42.2 km)');
  });

  it("rejects malformed waypoints via the input schema", async () => {
    const result = await dispatchToolCall("view-route-map", {
      activity_id: "123",
      waypoints: [{ km: -2, label: "" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Invalid arguments for view-route-map",
    );
  });

  it("get-route-map-data errors when neither id is provided", async () => {
    const result = await dispatchToolCall("get-route-map-data", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Provide either activity_id or route_id",
    );
  });
});

describe("activity segments handlers", () => {
  const activityWithEfforts = () =>
    detailedActivity({
      segment_efforts: [
        {
          name: "Hill Repeat",
          distance: 800,
          elapsed_time: 240,
          moving_time: 235,
          start_index: 10,
          pr_rank: 1,
          kom_rank: null,
          segment: { id: 55, average_grade: 4.2, maximum_grade: 8.1 },
        },
      ],
    });

  it("get-activity-segments-data flattens the embedded efforts", async () => {
    mockedById.mockResolvedValueOnce(activityWithEfforts());

    const result = await dispatchToolCall("get-activity-segments-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.name).toBe("Morning Run");
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.segments[0]).toMatchObject({
      name: "Hill Repeat",
      segmentId: "55",
      prRank: 1,
      startIndex: 10,
    });
  });

  it("view-activity-segments counts PRs and top-10s", async () => {
    mockedById.mockResolvedValueOnce(activityWithEfforts());

    const result = await dispatchToolCall("view-activity-segments", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Segments: 1");
    expect(text).toContain("PRs: 1, top-10s: 0");
  });
});

describe("compare activities handlers", () => {
  it("view-compare-activities reports both sides and the pace delta", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity({ id: "1" }));
    mockedById.mockResolvedValueOnce(
      detailedActivity({ id: "2", name: "Race Day", average_speed: 3.7 }),
    );

    const result = await dispatchToolCall("view-compare-activities", {
      activity_id_1: "1",
      activity_id_2: "2",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Activity 1: Morning Run");
    expect(text).toContain("Activity 2: Race Day");
    expect(text).toContain("faster");
  });

  it("propagates a fetch failure as isError", async () => {
    mockedById.mockRejectedValue(new Error("Record Not Found"));

    const result = await dispatchToolCall("get-compare-activities-data", {
      activity_id_1: "1",
      activity_id_2: "2",
    });

    expect(result.isError).toBe(true);
  });
});

describe("activity zones handlers", () => {
  const hrZones = [
    {
      type: "heartrate",
      sensor_based: true,
      distribution_buckets: [
        { min: 0, max: 130, time: 600 },
        { min: 130, max: 155, time: 1800 },
        { min: 155, max: -1, time: 600 },
      ],
    },
  ] as unknown as StravaActivityZone[];

  it("get-activity-zones-data returns the mapped zone payload", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedZones.mockResolvedValueOnce(hrZones);

    const result = await dispatchToolCall("get-activity-zones-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.activityId).toBe("123");
    expect(parsed.name).toBe("Morning Run");
    expect(parsed.zoneSets).toHaveLength(1);
    expect(parsed.zoneSets[0].type).toBe("heartrate");
    expect(parsed.zoneSets[0].totalSeconds).toBe(3000);
    expect(parsed.zoneSets[0].buckets[1]).toEqual({
      zone: 2,
      min: 130,
      max: 155,
      seconds: 1800,
      pct: 60,
    });
    // Strava's -1 open-ended top bucket becomes null.
    expect(parsed.zoneSets[0].buckets[2].max).toBeNull();
  });

  it("view-activity-zones summarises the dominant zone for the model", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedZones.mockResolvedValueOnce(hrZones);

    const result = await dispatchToolCall("view-activity-zones", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Activity Zones: Morning Run");
    expect(text).toContain("Heart rate: mostly Z2 (60% of 50 min)");
    expect(text).toContain(
      "[Interactive zone distribution chart rendered above]",
    );
  });

  it("view-activity-zones handles an activity with no zone data", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedZones.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("view-activity-zones", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No zone data recorded");
  });

  it("propagates a zones fetch failure as isError", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedZones.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await dispatchToolCall("get-activity-zones-data", {
      activity_id: "123",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Record Not Found");
  });
});
