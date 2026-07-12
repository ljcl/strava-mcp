import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityById,
  getActivityLaps,
  type StravaDetailedActivity,
  type StravaLap,
} from "../stravaClient";
import { getActivityLapsTool, mapLap } from "./getActivityLaps";

vi.mock("../stravaClient", () => ({
  getActivityById: vi.fn(),
  getActivityLaps: vi.fn(),
}));

const mockedById = vi.mocked(getActivityById);
const mockedLaps = vi.mocked(getActivityLaps);

const baseLap: StravaLap = {
  id: "900001",
  resource_state: 2,
  name: "Lap 1",
  activity: { id: "12345", resource_state: 1 },
  athlete: { id: "67890", resource_state: 1 },
  elapsed_time: 300,
  moving_time: 295,
  start_date: "2026-07-01T06:00:00Z",
  start_date_local: "2026-07-01T16:00:00Z",
  distance: 1000,
  lap_index: 1,
  average_speed: 3.33, // 5:00 /km
  average_cadence: 87,
  average_heartrate: 152.4,
  max_heartrate: 165,
  total_elevation_gain: 12,
} as unknown as StravaLap;

const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

describe("mapLap", () => {
  it("formats a run lap with pace and doubled cadence", () => {
    const entry = mapLap(baseLap, true);

    expect(entry.pace?.min_per_km).toBe("5:00");
    expect(entry.speed_kmh).toBeNull();
    expect(entry.average_cadence).toBe(174); // 87 strides -> 174 spm
    expect(entry.distance_km).toBe(1);
    expect(entry.average_heartrate).toBe(152.4);
  });

  it("formats a ride lap with speed, power, and rpm cadence", () => {
    const rideLap = {
      ...baseLap,
      distance: 5000,
      average_speed: 10, // 36 km/h
      average_watts: 214.6,
      device_watts: true,
      average_cadence: 88,
    } as unknown as StravaLap;

    const entry = mapLap(rideLap, false);

    expect(entry.pace).toBeNull();
    expect(entry.speed_kmh).toBe(36);
    expect(entry.average_watts).toBe(214.6);
    expect(entry.average_cadence).toBe(88); // rpm, not doubled
  });

  it("leaves missing sensors null instead of zero", () => {
    const bareLap = {
      ...baseLap,
      average_speed: null,
      average_cadence: null,
      average_heartrate: null,
      max_heartrate: null,
      total_elevation_gain: null,
    } as unknown as StravaLap;

    const entry = mapLap(bareLap, true);

    expect(entry.pace).toBeNull();
    expect(entry.average_cadence).toBeNull();
    expect(entry.average_heartrate).toBeNull();
    expect(entry.total_elevation_gain_m).toBeNull();
  });
});

describe("getActivityLapsTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedById.mockReset();
    mockedLaps.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getActivityLapsTool.execute({ id: "12345" });

    expect(result.isError).toBe(true);
    expect(mockedLaps).not.toHaveBeenCalled();
  });

  it("renders run laps with pace and structured output", async () => {
    mockedById.mockResolvedValueOnce(
      asDetail({ id: "12345", name: "Track Tuesday", sport_type: "Run" }),
    );
    mockedLaps.mockResolvedValueOnce([
      baseLap,
      { ...baseLap, lap_index: 2, name: "Lap 2" } as unknown as StravaLap,
    ]);

    const result = await getActivityLapsTool.execute({ id: "12345" });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain('Laps for "Track Tuesday"');
    expect(text).toContain("5:00 /km");
    expect(text).toContain("174 spm");
    expect(result.structuredContent?.sport_type).toBe("Run");
    expect(result.structuredContent?.lap_count).toBe(2);
    expect(result.structuredContent?.laps[0]?.pace?.min_per_km).toBe("5:00");
  });

  it("renders ride laps with speed and power", async () => {
    mockedById.mockResolvedValueOnce(
      asDetail({ id: "555", name: "Crit Practice", sport_type: "Ride" }),
    );
    mockedLaps.mockResolvedValueOnce([
      {
        ...baseLap,
        distance: 5000,
        average_speed: 10,
        average_watts: 214.6,
        device_watts: true,
        average_cadence: 88,
      } as unknown as StravaLap,
    ]);

    const result = await getActivityLapsTool.execute({ id: "555" });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("36 km/h");
    expect(text).toContain("215 W");
    expect(text).toContain("88 rpm");
    expect(text).not.toContain("/km");
    expect(result.structuredContent?.laps[0]?.speed_kmh).toBe(36);
  });

  it("reports gracefully when the activity has no laps", async () => {
    mockedById.mockResolvedValueOnce(
      asDetail({ id: "777", name: "Rest Day Walk", sport_type: "Walk" }),
    );
    mockedLaps.mockResolvedValueOnce([]);

    const result = await getActivityLapsTool.execute({ id: "777" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No laps recorded");
  });

  it("returns a friendly error for a missing activity", async () => {
    mockedById.mockRejectedValueOnce(new Error("Record Not Found"));
    mockedLaps.mockResolvedValueOnce([]);

    const result = await getActivityLapsTool.execute({ id: "404404" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not found");
  });
});
