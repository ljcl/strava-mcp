import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityZones as activityZonesFixture,
  handledNotFound,
  handledRateLimit,
} from "../__fixtures__";
import {
  getActivityZones as getActivityZonesClient,
  type StravaActivityZone,
} from "../stravaClient";
import { formatActivityZones, getActivityZonesTool } from "./getActivityZones";

// The fixture's `type` field widens to `string`; assert the discriminated shape.
const activityZones = activityZonesFixture as StravaActivityZone[];

vi.mock("../stravaClient", () => ({
  getActivityZones: vi.fn(),
}));

const mockedClient = vi.mocked(getActivityZonesClient);

describe("formatActivityZones", () => {
  it("renders time and percentage per zone for HR and power", () => {
    const text = formatActivityZones(activityZones);

    // Both zone sections are present.
    expect(text).toContain("Heart Rate Zones");
    expect(text).toContain("Power Zones");

    // HR total = 2220s; zone 2 (1200s) = 54.1%.
    expect(text).toContain("Z2 (115–152 bpm): 20:00 (54.1%)");
    // Final HR bucket uses the "+" notation and shows 0%. Durations come from
    // the one server-side formatDuration, which does not zero-pad the leading
    // unit — so "0:00" and "8:40", not "00:00" and "08:40" (#277).
    expect(text).toContain("Z5 (190+ bpm): 0:00 (0.0%)");

    // Power total = 2220s; zone 2 (1500s) = 67.6%.
    expect(text).toContain("Z2 (100–250 W): 25:00 (67.6%)");
    expect(text).toContain("Z3 (250+ W): 8:40 (23.4%)");
  });

  it("notes when a zone set has no distribution buckets", () => {
    const text = formatActivityZones([
      { type: "power", distribution_buckets: [] },
    ]);
    expect(text).toContain("Distribution data not available.");
  });
});

describe("getActivityZonesTool.execute", () => {
  beforeEach(() => {
    mockedClient.mockReset();
  });

  it("returns the formatted summary as the only text block", async () => {
    mockedClient.mockResolvedValue(activityZones);

    const result = await getActivityZonesTool.execute(
      { id: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.text).toContain("Activity Zones (ID: 12345)");
    expect(result.content[0]?.text).toContain("54.1%");
    expect(result.content[0]?.text).not.toContain("Complete Zone Data");
    expect(result.structuredContent?.zone_sets.length).toBeGreaterThan(0);
    expect(mockedClient).toHaveBeenCalledWith("test-token", "12345");
  });

  it("returns a graceful message when there is no zone data", async () => {
    mockedClient.mockResolvedValue([]);

    const result = await getActivityZonesTool.execute(
      { id: "999" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No zone data found");
  });

  it("returns a graceful message when buckets are empty", async () => {
    mockedClient.mockResolvedValue([
      { type: "heartrate", distribution_buckets: [] },
    ]);

    const result = await getActivityZonesTool.execute(
      { id: "999" },
      "test-token",
    );

    expect(result.content[0]?.text).toContain("No zone data found");
  });

  it("maps a not-found error to a friendly message", async () => {
    mockedClient.mockRejectedValue(handledNotFound("getActivityZones"));

    const result = await getActivityZonesTool.execute(
      { id: "42" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("❌ Activity with ID 42 not found.");
  });

  it("renders the rate-limit window on a RateLimitError", async () => {
    mockedClient.mockRejectedValue(handledRateLimit("getActivityZones"));

    const result = await getActivityZonesTool.execute(
      { id: "42" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.startsWith("❌")).toBe(true);
    expect(text).toContain("rate limit");
    expect(text).toContain("15-minute rate limit reached (100/100 requests).");
  });

  it("reports other failures with details", async () => {
    mockedClient.mockRejectedValue(new Error("Bad Gateway"));

    const result = await getActivityZonesTool.execute(
      { id: "42" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "❌ Failed to fetch zones for activity 42: Bad Gateway",
    );
  });
});
