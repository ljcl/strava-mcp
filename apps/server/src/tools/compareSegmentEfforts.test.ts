import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledSubscriptionRequired } from "../__fixtures__";
import {
  getActivityStreams,
  getSegmentEffort,
  listSegmentEfforts,
  type StravaDetailedSegmentEffort,
  StreamsUnavailableError,
} from "../stravaClient";
import { compareSegmentEffortsTool } from "./compareSegmentEfforts";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return {
    ...actual,
    getSegmentEffort: vi.fn(),
    getActivityStreams: vi.fn(),
    listSegmentEfforts: vi.fn(),
  };
});

const mockedEffort = vi.mocked(getSegmentEffort);
const mockedStreams = vi.mocked(getActivityStreams);
const mockedEffortList = vi.mocked(listSegmentEfforts);

const effort = (
  overrides: Record<string, unknown> = {},
): StravaDetailedSegmentEffort =>
  ({
    id: "e1",
    name: "Church Street Wall",
    segment: { id: "s1" },
    activity: { id: "a1" },
    start_date_local: "2026-05-01T07:00:00Z",
    elapsed_time: 270,
    moving_time: 270,
    distance: 900,
    start_index: 0,
    end_index: 90,
    ...overrides,
  }) as unknown as StravaDetailedSegmentEffort;

/**
 * Activity streams whose first 90 samples cover 900 m at the given per-third
 * paces (seconds per km), sampled every 10 m.
 */
const streamsFor = (
  pacesSecPerKm: [number, number, number],
  options: { hr?: number } = {},
) => {
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  let t = 500;
  for (let i = 0; i <= 90; i++) {
    const d = i * 10;
    const third = Math.min(2, Math.floor((d / 900) * 3)) as 0 | 1 | 2;
    time.push(t);
    distance.push(2000 + d);
    heartrate.push(options.hr ?? 150);
    t += (10 / 1000) * pacesSecPerKm[third];
  }
  return new Map<string, unknown[]>([
    ["time", time],
    ["distance", distance],
    ["heartrate", heartrate],
  ]);
};

describe("compare-segment-efforts execute", () => {
  beforeEach(() => {
    mockedEffort.mockReset();
    mockedStreams.mockReset();
    mockedEffortList.mockReset();
  });

  it("requires exactly one comparison target", async () => {
    const neither = await compareSegmentEffortsTool.execute(
      { effortId: "e1" },
      "test-token",
    );
    const both = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2", compareToPr: true },
      "test-token",
    );

    for (const result of [neither, both]) {
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(
        "exactly one of compareToEffortId or compareToPr",
      );
    }
    expect(mockedEffort).not.toHaveBeenCalled();
  });

  it("reports where the time went between two efforts", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort())
      .mockResolvedValueOnce(effort({ id: "e2", activity: { id: "a2" } }));
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300], { hr: 150 }))
      .mockResolvedValueOnce(streamsFor([300, 300, 360], { hr: 162 }));

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent;
    expect(structured?.segment_name).toBe("Church Street Wall");
    expect(structured?.total_delta_seconds).toBeGreaterThan(15);
    expect(structured?.thirds).toHaveLength(3);
    expect(structured?.thirds[2]?.delta_seconds).toBeGreaterThan(15);
    expect(structured?.thirds[0]?.avg_hr).toEqual([150, 162]);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Segment Effort Comparison");
    expect(text).toContain("Per third:");
    expect(text).toContain("slower than");
  });

  it("fetches full-resolution streams so the indices line up", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort())
      .mockResolvedValueOnce(effort({ id: "e2", activity: { id: "a2" } }));
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300]))
      .mockResolvedValueOnce(streamsFor([300, 300, 300]));

    await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    // No `resolution` — a downsampled response would slice the wrong window.
    for (const call of mockedStreams.mock.calls) {
      expect(call[3]).toEqual({ seriesType: "distance" });
    }
  });

  it("compares against the fastest recorded effort when asked for the PR", async () => {
    mockedEffort.mockResolvedValueOnce(effort());
    mockedEffortList.mockResolvedValueOnce([
      effort({ id: "slow", elapsed_time: 300, activity: { id: "a3" } }),
      effort({
        id: "pr",
        elapsed_time: 250,
        pr_rank: 1,
        activity: { id: "a2" },
      }),
      // The effort in hand must not be picked as its own comparison.
      effort({ id: "e1", elapsed_time: 200 }),
    ]);
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300]))
      .mockResolvedValueOnce(streamsFor([280, 280, 280]));

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToPr: true },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.effort_2.effort_id).toBe("pr");
    expect(result.structuredContent?.total_delta_seconds).toBeLessThan(0);
    expect(result.content[0]?.text).toContain("faster than");
  });

  it("says so when there is only one effort to compare", async () => {
    mockedEffort.mockResolvedValueOnce(effort());
    mockedEffortList.mockResolvedValueOnce([effort({ id: "e1" })]);

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToPr: true },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("only one recorded effort");
  });

  it("refuses to compare efforts on different segments", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort())
      .mockResolvedValueOnce(
        effort({ id: "e2", name: "Other Hill", segment: { id: "s2" } }),
      );

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("different segments");
    expect(mockedStreams).not.toHaveBeenCalled();
  });

  it("explains a stream-less activity rather than erroring opaquely", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort())
      .mockResolvedValueOnce(effort({ id: "e2", activity: { id: "a2" } }));
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300]))
      .mockRejectedValueOnce(new StreamsUnavailableError("a2"));

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("second effort");
    expect(result.content[0]?.text).toContain("no usable recorded streams");
  });

  it("explains an effort with no stream indices", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort({ start_index: null, end_index: null }))
      .mockResolvedValueOnce(effort({ id: "e2", activity: { id: "a2" } }));
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300]))
      .mockResolvedValueOnce(streamsFor([300, 300, 300]));

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("first effort");
  });

  it("points at compareToEffortId when the PR lookup is subscriber-gated", async () => {
    mockedEffort.mockResolvedValueOnce(effort());
    mockedEffortList.mockRejectedValueOnce(
      handledSubscriptionRequired("listSegmentEfforts for segment 55"),
    );

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToPr: true },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("subscribers");
    expect(text).toContain("compareToEffortId");
    expect(text).not.toContain("SUBSCRIPTION_REQUIRED");
  });

  it("surfaces a rate-limit failure", async () => {
    mockedEffort.mockRejectedValueOnce(
      new Error("Strava rate limit exceeded in getSegmentEffort."),
    );

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
  });

  it("reads the went-out-too-hard shape from the thirds", async () => {
    mockedEffort
      .mockResolvedValueOnce(effort())
      .mockResolvedValueOnce(effort({ id: "e2", activity: { id: "a2" } }));
    mockedStreams
      .mockResolvedValueOnce(streamsFor([300, 300, 300]))
      .mockResolvedValueOnce(streamsFor([270, 300, 390]));

    const result = await compareSegmentEffortsTool.execute(
      { effortId: "e1", compareToEffortId: "e2" },
      "test-token",
    );

    expect(result.structuredContent?.thirds[0]?.delta_seconds).toBeLessThan(0);
    expect(result.content[0]?.text).toContain("went out too hard");
  });
});
