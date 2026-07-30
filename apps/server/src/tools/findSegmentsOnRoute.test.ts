import { beforeEach, describe, expect, it, vi } from "vitest";
import { cumulativeDistances } from "../mapAnchors";
import {
  exploreSegments,
  listAllStarredSegments,
  type StravaExplorerResponse,
  type StravaSegment,
} from "../stravaClient";
import { loadTrackGeometry, type TrackGeometry } from "../trackGeometry";
import { findSegmentsOnRouteTool } from "./findSegmentsOnRoute";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return {
    ...actual,
    exploreSegments: vi.fn(),
    listAllStarredSegments: vi.fn(),
  };
});
vi.mock("../trackGeometry", () => ({ loadTrackGeometry: vi.fn() }));

const mockedExplore = vi.mocked(exploreSegments);
const mockedStarred = vi.mocked(listAllStarredSegments);
const mockedTrack = vi.mocked(loadTrackGeometry);

/** A ~6 km due-north course sampled every ~111 m. */
function course(overrides: Partial<TrackGeometry> = {}): TrackGeometry {
  const coordinates: Array<[number, number]> = [];
  for (let i = 0; i < 55; i++) coordinates.push([-37.8 + i * 0.001, 144.9]);
  return {
    source: "route",
    id: "9",
    name: "River Loop",
    activityType: "Ride",
    declaredDistanceM: 6000,
    coordinates,
    distances: cumulativeDistances(coordinates),
    distanceSource: "stream",
    efforts: [],
    ...overrides,
  };
}

/** An explorer segment running north along the course from `atIndex`. */
const explored = (
  id: string,
  atIndex: number,
  lengthIndices = 4,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  name: `Segment ${id}`,
  climb_category: 0,
  climb_category_desc: "NC",
  avg_grade: 3.2,
  start_latlng: [-37.8 + atIndex * 0.001, 144.9],
  end_latlng: [-37.8 + (atIndex + lengthIndices) * 0.001, 144.9],
  elev_difference: 14,
  distance: lengthIndices * 111,
  points: "",
  ...overrides,
});

const response = (segments: unknown[]): StravaExplorerResponse =>
  ({ segments }) as StravaExplorerResponse;

describe("find-segments-on-route execute", () => {
  beforeEach(() => {
    mockedExplore.mockReset();
    mockedStarred.mockReset();
    mockedTrack.mockReset();
    mockedStarred.mockResolvedValue([]);
    mockedExplore.mockResolvedValue(response([]));
  });

  it("rejects both ids and neither id", async () => {
    const both = await findSegmentsOnRouteTool.execute(
      { routeId: "9", activityId: "123" },
      "test-token",
    );
    const neither = await findSegmentsOnRouteTool.execute({}, "test-token");

    for (const result of [both, neither]) {
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(
        "exactly one of routeId or activityId",
      );
    }
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("returns on-course segments in course order with distance marks", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    mockedExplore
      .mockResolvedValueOnce(response([explored("late", 40)]))
      .mockResolvedValueOnce(response([explored("early", 3)]))
      .mockResolvedValue(response([]));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const segments = result.structuredContent?.segments ?? [];
    expect(segments.map((s) => s.segment_id)).toEqual(["early", "late"]);
    expect(segments[0]?.at_m).toBeLessThan(segments[1]!.at_m);
    expect(segments[1]?.at_m).toBeGreaterThan(4000);
    expect(result.content[0]?.text).toContain("River Loop");
  });

  it("drops a segment that is not on the course", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    // ~880 m east of the track.
    mockedExplore.mockResolvedValue(
      response([
        explored("off", 5, 4, {
          start_latlng: [-37.795, 144.91],
          end_latlng: [-37.79, 144.91],
        }),
      ]),
    );

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.structuredContent?.segments).toEqual([]);
    expect(result.content[0]?.text).toContain("No segments matched");
  });

  it("drops a segment that runs the opposite way along the course", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    mockedExplore.mockResolvedValue(response([explored("reverse", 20, -6)]));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.structuredContent?.segments).toEqual([]);
  });

  it("accepts a near-miss when the tolerance is raised", async () => {
    const near = explored("near", 5, 4, {
      start_latlng: [-37.795, 144.9012],
      end_latlng: [-37.791, 144.9012],
    });
    mockedTrack.mockResolvedValue(course());
    mockedExplore.mockResolvedValue(response([near]));

    const tight = await findSegmentsOnRouteTool.execute(
      { routeId: "9", toleranceMeters: 50 },
      "test-token",
    );
    const loose = await findSegmentsOnRouteTool.execute(
      { routeId: "9", toleranceMeters: 200 },
      "test-token",
    );

    expect(tight.structuredContent?.segments).toEqual([]);
    expect(loose.structuredContent?.segments).toHaveLength(1);
    expect(loose.structuredContent?.tolerance_m).toBe(200);
  });

  it("dedupes a segment returned by two overlapping tiles", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    mockedExplore.mockResolvedValue(response([explored("dup", 10)]));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(mockedExplore.mock.calls.length).toBeGreaterThan(1);
    expect(result.structuredContent?.segments).toHaveLength(1);
  });

  it("bounds the explore fan-out and reports how many stretches it searched", async () => {
    mockedTrack.mockResolvedValueOnce(course());

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    const tiles = result.structuredContent?.tiles_searched ?? 0;
    expect(tiles).toBe(mockedExplore.mock.calls.length);
    expect(tiles).toBeLessThanOrEqual(12);
    expect(result.content[0]?.text).toContain(`${tiles} stretch`);
  });

  it("filters to the course's own discipline by default", async () => {
    mockedTrack.mockResolvedValueOnce(course({ activityType: "TrailRun" }));

    await findSegmentsOnRouteTool.execute({ routeId: "9" }, "test-token");

    expect(mockedExplore).toHaveBeenCalledWith(
      "test-token",
      expect.any(String),
      "running",
    );
  });

  it("honours an explicit activityType", async () => {
    mockedTrack.mockResolvedValueOnce(course({ activityType: "TrailRun" }));

    await findSegmentsOnRouteTool.execute(
      { routeId: "9", activityType: "riding" },
      "test-token",
    );

    expect(mockedExplore).toHaveBeenCalledWith(
      "test-token",
      expect.any(String),
      "riding",
    );
  });

  it("flags starred segments from the complete starred list", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    mockedExplore.mockResolvedValue(response([explored("s1", 10)]));
    mockedStarred.mockResolvedValue([{ id: "s1" } as unknown as StravaSegment]);

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.structuredContent?.segments[0]?.starred).toBe(true);
    expect(result.content[0]?.text).toContain("⭐");
  });

  it("still answers when the starred list cannot be fetched", async () => {
    mockedTrack.mockResolvedValueOnce(course());
    mockedExplore.mockResolvedValue(response([explored("s1", 10)]));
    mockedStarred.mockRejectedValue(new Error("boom"));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.segments[0]?.starred).toBe(false);
  });

  it("cross-references your own efforts when scanning an activity", async () => {
    mockedTrack.mockResolvedValueOnce(
      course({
        source: "activity",
        id: "123",
        name: "Sunday Long Run",
        activityType: "Run",
        efforts: [
          {
            segmentId: "s1",
            name: "Segment s1",
            elapsedTime: 245,
            prRank: 1,
            komRank: null,
          },
        ],
      }),
    );
    mockedExplore.mockResolvedValue(response([explored("s1", 10)]));

    const result = await findSegmentsOnRouteTool.execute(
      { activityId: "123" },
      "test-token",
    );

    const segment = result.structuredContent?.segments[0];
    expect(segment?.your_effort).toEqual({
      elapsed_time_s: 245,
      pr_rank: 1,
      kom_rank: null,
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PR");
    expect(text).toContain("your time 4:05");
  });

  it("stops on a rate limit and says the scan is incomplete", async () => {
    // A course long enough to need more tiles than the fan-out runs at once,
    // so an abort has remaining tiles to skip.
    const coordinates: Array<[number, number]> = [];
    for (let i = 0; i < 220; i++) coordinates.push([-37.8 + i * 0.001, 144.9]);
    mockedTrack.mockResolvedValueOnce(
      course({
        coordinates,
        distances: cumulativeDistances(coordinates),
        declaredDistanceM: 24000,
      }),
    );
    mockedExplore
      .mockResolvedValueOnce(response([explored("s1", 2)]))
      .mockRejectedValue(new Error("Strava rate limit exceeded in explore."));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const warnings = result.structuredContent?.warnings ?? [];
    expect(warnings.join(" ")).toContain("rate limit");
    expect(result.content[0]?.text).toContain("Warning:");
    // The scan gave up rather than spending the rest of the tiles on 429s.
    const tiles = result.structuredContent?.tiles_searched ?? 0;
    expect(tiles).toBeGreaterThan(3);
    expect(mockedExplore.mock.calls.length).toBeLessThan(tiles);
  });

  it("warns when course distances were derived rather than recorded", async () => {
    mockedTrack.mockResolvedValueOnce(course({ distanceSource: "haversine" }));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.structuredContent?.warnings.join(" ")).toContain(
      "derived from its geometry",
    );
  });

  it("reports a course with no GPS track", async () => {
    mockedTrack.mockResolvedValueOnce(
      course({ coordinates: [], distances: [] }),
    );

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no GPS track");
  });

  it("surfaces a failure to load the course", async () => {
    mockedTrack.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await findSegmentsOnRouteTool.execute(
      { routeId: "9" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Record Not Found");
  });
});
