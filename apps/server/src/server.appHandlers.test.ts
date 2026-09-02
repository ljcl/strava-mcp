/**
 * Success and error paths for the MCP App tool handlers in server.ts (#115).
 * Table-driven through dispatchToolCall — the same path the host uses — with
 * the Strava client mocked. The missing-token table pins the regression where
 * those early returns lacked `isError: true` and surfaced as ordinary content.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledRateLimit, handledSubscriptionRequired } from "./__fixtures__";
import { HttpError, RateLimitError, stravaApi } from "./fetchClient";
import {
  exportRouteGpx,
  getActivityById,
  getActivityLaps,
  getActivityPhotos,
  getActivityZones,
  getAllActivities,
  getRouteById,
  getRouteStreams,
  getSegmentById,
  listSegmentEfforts,
  type StravaActivityZone,
  type StravaDetailedActivity,
  type StravaDetailedSegment,
  type StravaDetailedSegmentEffort,
  type StravaLap,
  type StravaRoute,
  type StravaSummaryActivity,
  StreamsUnavailableError,
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
    getRouteStreams: vi.fn(),
    getSegmentById: vi.fn(),
    listSegmentEfforts: vi.fn(),
    exportRouteGpx: vi.fn(),
  };
});

vi.mock("./fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchClient")>();
  return {
    ...actual,
    stravaApi: { get: vi.fn() },
  };
});

// dispatchToolCall resolves the access token once per call (#240), so the
// token source is mocked here rather than the env var each handler used to read.
vi.mock("./tokenManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenManager")>();
  return { ...actual, getStravaToken: vi.fn() };
});

// Import after the mocks so server.ts's modules see the mocked client.
const { dispatchToolCall } = await import("./server");
const { getStravaToken, NoTokenError } = await import("./tokenManager");
const mockedToken = vi.mocked(getStravaToken);

const mockedById = vi.mocked(getActivityById);
const mockedLaps = vi.mocked(getActivityLaps);
const mockedZones = vi.mocked(getActivityZones);
const mockedPhotos = vi.mocked(getActivityPhotos);
const mockedList = vi.mocked(getAllActivities);
const mockedRoute = vi.mocked(getRouteById);
const mockedRouteStreams = vi.mocked(getRouteStreams);
const mockedSegment = vi.mocked(getSegmentById);
const mockedSegmentEfforts = vi.mocked(listSegmentEfforts);
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

function detailedSegment(
  overrides: Record<string, unknown> = {},
): StravaDetailedSegment {
  return {
    id: "55",
    name: "Heartbreak Hill",
    activity_type: "Run",
    distance: 800,
    average_grade: 5.4,
    maximum_grade: 11.2,
    total_elevation_gain: 43,
    climb_category: 3,
    starred: true,
    ...overrides,
  } as unknown as StravaDetailedSegment;
}

function segmentEffort(
  overrides: Record<string, unknown> = {},
): StravaDetailedSegmentEffort {
  return {
    id: "1",
    activity: { id: "900" },
    start_date_local: "2026-01-05T07:00:00Z",
    elapsed_time: 250,
    moving_time: 248,
    distance: 800,
    ...overrides,
  } as unknown as StravaDetailedSegmentEffort;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedToken.mockResolvedValue("test-token");
  // Default a saved route to "no stored profile" (#264), so route cases that
  // are not about elevation keep rendering from the polyline as before. Tests
  // that care override the stream mock.
  mockedRouteStreams.mockRejectedValue(
    new StreamsUnavailableError("9", "route"),
  );
  vi.mocked(exportRouteGpx).mockResolvedValue("");
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
  ["view-segment-progress", { segment_id: "55" }],
  ["get-segment-progress-data", { segment_id: "55" }],
];

describe("app handlers with no Strava token", () => {
  it.each(APP_TOOL_CALLS)(
    "%s returns isError: true instead of plain content",
    async (name, args) => {
      mockedToken.mockRejectedValueOnce(new NoTokenError());

      const result = await dispatchToolCall(name, args);

      expect(result.isError).toBe(true);
      // One message for every tool, naming the one recovery (#240).
      expect(result.content[0]?.text).toContain("Not connected to Strava");
      expect(result.content[0]?.text).toContain("/auth/start");
    },
  );

  it("resolves the token once per call and hands it to the handler", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());

    await dispatchToolCall("view-activity-chart", { activity_id: "123" });

    expect(mockedToken).toHaveBeenCalledTimes(1);
    expect(mockedById).toHaveBeenCalledWith("test-token", "123");
  });

  it("does not run the handler when the token cannot be resolved", async () => {
    mockedToken.mockRejectedValueOnce(new NoTokenError());

    await dispatchToolCall("view-activity-chart", { activity_id: "123" });

    expect(mockedById).not.toHaveBeenCalled();
  });
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
    expect(mockedById).toHaveBeenCalledWith("test-token", "123");
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
    // A string, not a number: ids are 64-bit and `Number()` here used to
    // round anything past 2^53 (#270).
    expect(parsed.activityId).toBe("123");
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

  it("a view-/get-…-data pair builds one quantized window, so the cached scan is shared (#329)", async () => {
    // The two calls of one app open land seconds apart; a raw Date.now()
    // per call gave them different `after` values, two URLs, and two full
    // history scans. The bounds are floored to the minute so the pair keys
    // onto one cached listing.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-19T10:00:05Z"));
      mockedList.mockResolvedValue([summaryRun()]);

      await dispatchToolCall("view-cadence-trends", { weeks: 4 });
      vi.setSystemTime(new Date("2026-08-19T10:00:35Z")); // 30 s later
      await dispatchToolCall("get-cadence-trend-data", { weeks: 4 });

      const [viewCall, dataCall] = mockedList.mock.calls.slice(-2);
      expect(viewCall?.[1]?.after).toBeDefined();
      expect(viewCall?.[1]?.after).toBe(dataCall?.[1]?.after);
      expect((viewCall?.[1]?.after ?? 0) % 60).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the fitness-trend pair shares both window bounds (#329)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-19T10:00:05Z"));
      mockedList.mockResolvedValue([]);

      await dispatchToolCall("view-fitness-trend", {});
      vi.setSystemTime(new Date("2026-08-19T10:00:35Z"));
      await dispatchToolCall("get-fitness-trend-data", {});

      const [viewCall, dataCall] = mockedList.mock.calls.slice(-2);
      expect(viewCall?.[1]?.after).toBe(dataCall?.[1]?.after);
      expect(viewCall?.[1]?.before).toBe(dataCall?.[1]?.before);
      // `before` still covers "now": the next minute boundary, not the last.
      expect(viewCall?.[1]?.before).toBeGreaterThan(
        new Date("2026-08-19T10:00:05Z").getTime() / 1000,
      );
    } finally {
      vi.useRealTimers();
    }
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

describe("fitness trend handlers", () => {
  /** `count` consecutive daily runs ending yesterday, each with load 80. */
  function recentBlock(count: number): StravaSummaryActivity[] {
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]!;
      return summaryRun({
        id: `load-${i}`,
        start_date: `${date}T07:00:00Z`,
        start_date_local: `${date}T07:00:00`,
        suffer_score: 80,
      });
    });
  }

  /** YYYY-MM-DD `days` from today, for taper target dates. */
  function inDays(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
  }

  it("get-fitness-trend-data returns the series, projection, and bands", async () => {
    mockedList.mockResolvedValueOnce(recentBlock(21));

    const result = await dispatchToolCall("get-fitness-trend-data", {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.days).toBe(90);
    expect(parsed.series).toHaveLength(90);
    // projectDays defaults to a fortnight for the chart, not the text tool's 0.
    expect(parsed.projection).toHaveLength(14);
    expect(parsed.taper).toBeNull();
    expect(parsed.current.ctl).toBeGreaterThan(0);
    expect(parsed.activitiesIncluded).toBe(21);
    expect(Array.isArray(parsed.bands)).toBe(true);
  });

  it("get-fitness-trend-data solves a taper in camelCase for the app", async () => {
    mockedList.mockResolvedValueOnce(recentBlock(21));
    const targetDate = inDays(21);

    const result = await dispatchToolCall("get-fitness-trend-data", {
      targetDate,
      targetTsb: 12,
    });

    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.taper.targetDate).toBe(targetDate);
    expect(parsed.taper.targetTsb).toBe(12);
    expect(parsed.taper.achievedTsb).toBeCloseTo(12, 1);
    expect(parsed.taper.days).toHaveLength(21);
    expect(parsed.taper.weeks).toHaveLength(3);
    expect(parsed.taper.weeks[0].dailyLoad).toBeGreaterThan(0);
    expect(parsed.taper.weeks[0].startDate).toBeTruthy();
  });

  it("view-fitness-trend prints the same headline numbers as the chart", async () => {
    mockedList.mockResolvedValueOnce(recentBlock(21));
    const targetDate = inDays(14);

    const result = await dispatchToolCall("view-fitness-trend", {
      targetDate,
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Fitness Trend (last 90 days)");
    expect(text).toContain("Fitness (CTL)");
    expect(text).toContain(`Taper to ${targetDate}`);
    expect(text).toContain("week 1");
    expect(text).toContain("[Interactive fitness trend chart rendered above]");
  });

  it("view-fitness-trend reports the fresh date when only resting", async () => {
    mockedList.mockResolvedValueOnce(recentBlock(10));

    const result = await dispatchToolCall("view-fitness-trend", {});

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("form turns positive on");
    expect(text).not.toContain("Taper to");
  });

  it("rejects a malformed target date via the input schema", async () => {
    const result = await dispatchToolCall("get-fitness-trend-data", {
      targetDate: "next Sunday",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid target date");
    expect(mockedList).not.toHaveBeenCalled();
  });
});

describe("segment progress handlers", () => {
  it("view-segment-progress summarises best, latest, and the half-vs-half trend", async () => {
    mockedSegment.mockResolvedValueOnce(detailedSegment());
    mockedSegmentEfforts.mockResolvedValueOnce([
      segmentEffort({
        id: "1",
        start_date_local: "2026-01-05T07:00:00Z",
        elapsed_time: 260,
        average_heartrate: 172,
      }),
      segmentEffort({
        id: "2",
        start_date_local: "2026-02-05T07:00:00Z",
        elapsed_time: 250,
        average_heartrate: 170,
      }),
      segmentEffort({
        id: "3",
        start_date_local: "2026-03-05T07:00:00Z",
        elapsed_time: 250,
        average_heartrate: 162,
      }),
      segmentEffort({
        id: "4",
        start_date_local: "2026-04-05T07:00:00Z",
        elapsed_time: 260,
        average_heartrate: 160,
      }),
    ]);

    const result = await dispatchToolCall("view-segment-progress", {
      segment_id: "55",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Segment: Heartbreak Hill (800 m, 5.4%)");
    expect(text).toContain("Efforts: 4 from 2026-01-05 to 2026-04-05");
    expect(text).toContain("Best: 4:10 on 2026-02-05");
    expect(text).toContain("Latest: 4:20 on 2026-04-05 (+10s vs best)");
    expect(text).toContain(
      "Recent half vs early half: same average time, -10 bpm average heart rate",
    );
  });

  it("view-segment-progress says so when the range holds no efforts", async () => {
    mockedSegment.mockResolvedValueOnce(detailedSegment());
    mockedSegmentEfforts.mockResolvedValueOnce([]);

    const result = await dispatchToolCall("view-segment-progress", {
      segment_id: "55",
      start_date_local: "2026-06-01T00:00:00Z",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No efforts recorded");
  });

  it("get-segment-progress-data returns the ranked effort history", async () => {
    mockedSegment.mockResolvedValueOnce(detailedSegment());
    mockedSegmentEfforts.mockResolvedValueOnce([
      segmentEffort({ id: "2", start_date_local: "2026-02-05T07:00:00Z" }),
      segmentEffort({
        id: "1",
        start_date_local: "2026-01-05T07:00:00Z",
        elapsed_time: 240,
        pr_rank: 1,
      }),
    ]);

    const result = await dispatchToolCall("get-segment-progress-data", {
      segment_id: "55",
      end_date_local: "2026-03-01T00:00:00Z",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.segment.name).toBe("Heartbreak Hill");
    expect(parsed.efforts.map((e: { id: string }) => e.id)).toEqual(["1", "2"]);
    expect(parsed.efforts[0]).toMatchObject({ rank: 1, prRank: 1 });
    expect(parsed.summary.bestSeconds).toBe(240);
    expect(mockedSegmentEfforts).toHaveBeenCalledWith("test-token", "55", {
      startDateLocal: undefined,
      endDateLocal: "2026-03-01T00:00:00Z",
      perPage: 200,
    });
  });

  it("explains the subscriber-only endpoint instead of leaking the sentinel", async () => {
    mockedSegment.mockResolvedValueOnce(detailedSegment());
    mockedSegmentEfforts.mockRejectedValueOnce(
      handledSubscriptionRequired("listSegmentEfforts for segment 55"),
    );

    const result = await dispatchToolCall("view-segment-progress", {
      segment_id: "55",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires a Strava subscription");
    expect(result.content[0]?.text).not.toContain("SUBSCRIPTION_REQUIRED");
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

  it("get-route-map-data still renders the map when the lap layer hits a rate limit", async () => {
    // The lap and photo layers sat behind a bare `catch {}`, so an exhausted
    // quota lost the markers with nothing said — #237 again, one layer down.
    // The geometry is already fetched by then, so the fix is a warning naming
    // the exhausted window, not the loss of the whole map.
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
    mockedLaps.mockRejectedValueOnce(handledRateLimit("getActivityLaps(123)"));
    mockedPhotos.mockResolvedValueOnce([]);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.coordinates).toEqual(coords);
    expect(parsed.annotations?.laps).toBeUndefined();
    expect(parsed.layerWarnings).toEqual([
      "Dropped lap markers: 15-minute rate limit reached (100/100 requests). The map renders without them.",
    ]);
    // The bare window description, not the internal call that hit it.
    expect(parsed.layerWarnings[0]).not.toContain("getActivityLaps");
    logged.mockRestore();
  });

  it("get-route-map-data drops the photo layer with a reason, not in silence", async () => {
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
    mockedPhotos.mockRejectedValueOnce(new Error("Invalid data format"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    // The map still renders; the failure is on the record rather than nowhere.
    expect(result.isError).toBeUndefined();
    expect(
      logged.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("photo pins unavailable for activity 123") &&
          call[0].includes("Invalid data format"),
      ),
    ).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.layerWarnings).toEqual([
      "Dropped photo pins: Invalid data format. The map renders without them.",
    ]);
    logged.mockRestore();
  });

  it("get-route-map-data falls back to the polyline for a stream-less activity", async () => {
    mockedById.mockResolvedValueOnce(detailedActivity());
    // Strava answers 404 for an activity that recorded no samples.
    mockedApiGet.mockRejectedValueOnce(
      new HttpError("HTTP 404: Record Not Found", {
        status: 404,
        statusText: "Not Found",
        data: "Record Not Found",
      }),
    );

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.coordinates).toHaveLength(3);
    expect(parsed.streams).toBeUndefined();
  });

  it("get-route-map-data reports a rate limit rather than silently dropping streams", async () => {
    // #237: an exhausted quota used to be swallowed into the polyline path,
    // so the user got a metric-less map with no hint that waiting would fix it.
    mockedById.mockResolvedValueOnce(detailedActivity());
    mockedApiGet.mockRejectedValueOnce(
      new RateLimitError(
        "15-minute rate limit reached (100/100 requests).",
        { status: 429, statusText: "Too Many Requests", data: "" },
        { observedAt: Date.now(), shortTerm: { limit: 100, usage: 100 } },
        60,
      ),
    );

    const result = await dispatchToolCall("get-route-map-data", {
      activity_id: "123",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
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

  // #264: before this, the route branch returned coordinates only, so the
  // elevation strip and metric colouring were dead code for every route_id.
  it("get-route-map-data attaches a saved route's stored elevation profile", async () => {
    mockedRoute.mockResolvedValueOnce({
      id: "9",
      name: "River Loop",
      type: 2,
      distance: 5000,
      elevation_gain: 50,
      created_at: "2026-01-01T00:00:00Z",
      map: { summary_polyline: POLYLINE },
    } as unknown as StravaRoute);
    mockedRouteStreams.mockReset();
    mockedRouteStreams.mockResolvedValueOnce(
      new Map<string, unknown[]>([
        ["distance", [0, 100, 200]],
        ["altitude", [10, 25, 18]],
        [
          "latlng",
          [
            [38.5, -120.2],
            [40.7, -120.95],
            [43.252, -126.453],
          ],
        ],
      ]),
    );

    const result = await dispatchToolCall("get-route-map-data", {
      route_id: "9",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.streams.altitude).toEqual([10, 25, 18]);
    expect(parsed.streams.distance).toEqual([0, 100, 200]);
    // The stream geometry wins over the polyline: it is index-aligned with the
    // elevation, which is what lets the app colour the track by it.
    expect(parsed.coordinates).toHaveLength(3);
  });

  it("get-route-map-data still maps a route with no stored profile", async () => {
    mockedRoute.mockResolvedValueOnce({
      id: "9",
      name: "River Loop",
      type: 2,
      distance: 5000,
      elevation_gain: 50,
      created_at: "2026-01-01T00:00:00Z",
      map: { summary_polyline: POLYLINE },
    } as unknown as StravaRoute);

    const result = await dispatchToolCall("get-route-map-data", {
      route_id: "9",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.streams).toBeUndefined();
    expect(parsed.coordinates.length).toBeGreaterThan(0);
  });

  it("get-route-map-data propagates a quota failure rather than dropping elevation", async () => {
    mockedRoute.mockResolvedValueOnce({
      id: "9",
      name: "River Loop",
      type: 2,
      distance: 5000,
      elevation_gain: 50,
      created_at: "2026-01-01T00:00:00Z",
      map: { summary_polyline: POLYLINE },
    } as unknown as StravaRoute);
    mockedRouteStreams.mockReset();
    mockedRouteStreams.mockRejectedValueOnce(
      handledRateLimit("getRouteStreams for ID 9"),
    );

    const result = await dispatchToolCall("get-route-map-data", {
      route_id: "9",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
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
