import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSegmentById,
  getSegmentStreams,
  type StravaDetailedSegment,
  type StravaStreamSet,
  StreamsUnavailableError,
} from "../stravaClient";
import { getSegmentProfileTool } from "./getSegmentProfile";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return {
    ...actual,
    getSegmentById: vi.fn(),
    getSegmentStreams: vi.fn(),
  };
});

const mockedSegment = vi.mocked(getSegmentById);
const mockedStreams = vi.mocked(getSegmentStreams);

const segment = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "789",
    name: "Church Street Wall",
    activity_type: "Run",
    distance: 1500,
    average_grade: 4,
    maximum_grade: 12,
    climb_category: 2,
    ...overrides,
  }) as unknown as StravaDetailedSegment;

/** Streams for `pitches` of `[lengthM, gradePct]`, sampled every 10 m. */
const streamsFor = (pitches: Array<[number, number]>): StravaStreamSet => {
  const distance = [0];
  const altitude = [100];
  for (const [lengthM, gradePct] of pitches) {
    for (let i = 0; i < Math.round(lengthM / 10); i++) {
      distance.push(distance[distance.length - 1]! + 10);
      altitude.push(altitude[altitude.length - 1]! + gradePct / 10);
    }
  }
  return new Map<string, unknown[]>([
    ["distance", distance],
    ["altitude", altitude],
  ]);
};

describe("get-segment-profile execute", () => {
  beforeEach(() => {
    mockedSegment.mockReset();
    mockedStreams.mockReset();
  });

  it("reports the crux and shape a single average grade hides", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    // 1 km flat then 500 m at 12%: average 4%, which is the lie.
    mockedStreams.mockResolvedValueOnce(
      streamsFor([
        [1000, 0],
        [500, 12],
      ]),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Church Street Wall");
    expect(text).toContain("Back-loaded");
    expect(text).toContain("Gradient every 100 m");
    const structured = result.structuredContent;
    expect(structured?.profile.shape).toBe("back-loaded");
    expect(structured?.profile.steepest?.grade_pct).toBeCloseTo(12, 1);
    expect(structured?.climb_category).toBe(2);
    expect(structured?.segment_id).toBe("789");
  });

  it("describes a steady ramp of the same average as steady", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockResolvedValueOnce(streamsFor([[1500, 4]]));

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.structuredContent?.profile.shape).toBe("steady");
    expect(result.content[0]?.text).toContain("Steady");
  });

  it("lists each sustained climb inside the segment", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockResolvedValueOnce(
      streamsFor([
        [400, 6],
        [400, -6],
        [400, 6],
      ]),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.structuredContent?.profile.climbs).toHaveLength(2);
    expect(result.content[0]?.text).toContain("Sustained climbs (2)");
  });

  it("explains a subscription block in plain English", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockRejectedValueOnce(
      new Error(
        "SUBSCRIPTION_REQUIRED: Access to this feature requires a Strava subscription. Context: getSegmentStreams for ID 789",
      ),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("subscribers");
    expect(text).not.toContain("SUBSCRIPTION_REQUIRED");
  });

  it("says a segment has no stored profile rather than erroring opaquely", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockRejectedValueOnce(
      new StreamsUnavailableError("789", "segment"),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no stored elevation streams");
  });

  it("reports a missing altitude stream without throwing", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockResolvedValueOnce(
      new Map<string, unknown[]>([["distance", [0, 10, 20]]]),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no stored elevation profile");
  });

  it("surfaces a rate-limit failure instead of claiming no profile", async () => {
    mockedSegment.mockResolvedValueOnce(segment());
    mockedStreams.mockRejectedValueOnce(
      new Error("Strava rate limit exceeded in getSegmentStreams for ID 789."),
    );

    const result = await getSegmentProfileTool.execute(
      { segmentId: "789" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
  });
});
