import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicRunActivity, rideActivity } from "../__fixtures__";
import { stravaApi } from "../fetchClient";
import {
  getActivityById,
  getActivityLaps,
  getAthleteZones,
  type StravaDetailedActivity,
  type StravaLap,
} from "../stravaClient";
import { getRunningSummaryTool } from "./getRunningSummary";

vi.mock("../stravaClient", () => ({
  getActivityById: vi.fn(),
  getActivityLaps: vi.fn(),
  getAthleteZones: vi.fn(),
}));

vi.mock("../fetchClient", () => ({
  stravaApi: { get: vi.fn() },
}));

const mockedById = vi.mocked(getActivityById);
const mockedLaps = vi.mocked(getActivityLaps);
const mockedZones = vi.mocked(getAthleteZones);
const mockedApiGet = vi.mocked(stravaApi.get);

const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

const sampleLap = {
  lap_index: 1,
  name: "Lap 1",
  distance: 1000,
  moving_time: 360,
  average_speed: 2.78,
  average_cadence: 85,
  average_heartrate: 150,
  max_heartrate: 160,
  total_elevation_gain: 10,
} as unknown as StravaLap;

describe("getRunningSummaryTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedById.mockReset();
    mockedLaps.mockReset();
    mockedZones.mockReset();
    mockedApiGet.mockReset();
    // Default: no stream data and no zones available.
    mockedApiGet.mockRejectedValue(new Error("no streams"));
    mockedZones.mockRejectedValue(new Error("no zones"));
    mockedLaps.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getRunningSummaryTool.execute({ activityId: "1" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
  });

  it("rejects non-running activities", async () => {
    mockedById.mockResolvedValueOnce(asDetail(rideActivity));

    const result = await getRunningSummaryTool.execute({ activityId: "999" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("is not a running activity");
  });

  it("builds a summary with pace, cadence, HR, and gear", async () => {
    mockedById.mockResolvedValueOnce(
      asDetail({
        ...basicRunActivity,
        gear: { id: "g1", name: "Pegasus" },
      }),
    );
    mockedLaps.mockResolvedValueOnce([sampleLap]);

    const result = await getRunningSummaryTool.execute({
      activityId: "12345678",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Running Summary: Morning Run");
    expect(text).toContain("Distance: 5 km");
    expect(text).toContain("Pace");
    // Strava reports strides; running cadence is doubled to steps/min.
    expect(text).toContain("170 spm");
    expect(text).toContain("Average: 145 bpm");
    expect(text).toContain("**Gear**: Pegasus");

    const summary = result.structuredContent;
    expect(summary?.activity_id).toBe("12345678");
    expect(summary?.laps).toHaveLength(1);
    // No HR stream + no zones => zone distribution is omitted.
    expect(summary?.heart_rate?.zones).toBeNull();
  });

  it("computes HR zone distribution when streams and zones are present", async () => {
    mockedById.mockResolvedValueOnce(asDetail(basicRunActivity));
    mockedApiGet.mockResolvedValueOnce({
      data: [
        { type: "time", data: [0, 1, 2, 3] },
        { type: "heartrate", data: [120, 120, 160, 160] },
      ],
    } as never);
    mockedZones.mockResolvedValueOnce({
      heart_rate: {
        zones: [
          { min: 0, max: 140 },
          { min: 140, max: 999 },
        ],
      },
    } as never);

    const result = await getRunningSummaryTool.execute({
      activityId: "12345678",
    });

    expect(result.content[0]?.text).toContain("Zone Distribution");
    expect(result.structuredContent?.heart_rate?.zones).not.toBeNull();
  });

  it("maps a not-found error to a friendly message", async () => {
    mockedById.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await getRunningSummaryTool.execute({ activityId: "42" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Activity with ID 42 not found");
  });
});
