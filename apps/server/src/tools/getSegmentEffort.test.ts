import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSegmentEffort as fetchSegmentEffort,
  type StravaDetailedSegmentEffort,
} from "../stravaClient";
import { getSegmentEffortTool } from "./getSegmentEffort";

vi.mock("../stravaClient", () => ({
  getSegmentEffort: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchSegmentEffort);

// An effort id beyond Number.MAX_SAFE_INTEGER — representable only as a string.
const bigEffortId = "3503400000123456789";

const effort = {
  id: bigEffortId,
  name: "Box Hill Climb",
  activity: { id: "123" },
  athlete: { id: "456" },
  segment: { id: "789" },
  start_date_local: "2026-07-01T08:00:00Z",
  moving_time: 300,
  elapsed_time: 310,
  distance: 2500,
  kom_rank: null,
  pr_rank: 1,
  hidden: false,
} as unknown as StravaDetailedSegmentEffort;

describe("get-segment-effort input schema", () => {
  const schema = getSegmentEffortTool.inputSchema;

  it("accepts a digit-string id above 2^53 without precision loss", () => {
    const result = schema.safeParse({ effortId: bigEffortId });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effortId).toBe(bigEffortId);
    }
  });

  it("rejects a bare number id (string-only schema, no integer branch)", () => {
    // The schema no longer advertises an integer branch, so a host cannot send
    // the id as a JSON number — the path where JSON.parse rounds oversized ids.
    const result = schema.safeParse({ effortId: 123456789 });
    expect(result.success).toBe(false);
  });

  it("rejects a number id above 2^53 instead of fetching a rounded id", () => {
    const result = schema.safeParse({ effortId: 2 ** 53 + 2 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric string id", () => {
    const result = schema.safeParse({ effortId: "123abc" });
    expect(result.success).toBe(false);
  });
});

describe("get-segment-effort execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("passes a string effort id through to the client untouched", async () => {
    mockedFetch.mockResolvedValueOnce(effort);

    const result = await getSegmentEffortTool.execute({
      effortId: bigEffortId,
    });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", bigEffortId);
    expect(result.content[0]?.text).toContain(bigEffortId);
  });
});
