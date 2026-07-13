import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivity as postActivity,
  type StravaDetailedActivity,
} from "../stravaClient";
import { createActivityTool } from "./createActivity";

vi.mock("../stravaClient", () => ({
  createActivity: vi.fn(),
}));

const mockedPost = vi.mocked(postActivity);

function createdActivity(
  overrides: Partial<StravaDetailedActivity> = {},
): StravaDetailedActivity {
  return {
    id: "9001",
    name: "Morning Yoga",
    sport_type: "Yoga",
    description: null,
    ...overrides,
  } as unknown as StravaDetailedActivity;
}

const baseInput = {
  name: "Morning Yoga",
  sportType: "Yoga",
  startDateLocal: "2026-07-13T07:30:00",
  elapsedTimeSeconds: 1800,
};

describe("createActivityTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedPost.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await createActivityTool.execute(baseInput);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it("creates a manual activity from the required fields", async () => {
    mockedPost.mockResolvedValueOnce(createdActivity());

    const result = await createActivityTool.execute(baseInput);

    expect(mockedPost).toHaveBeenCalledWith("test-token", {
      name: "Morning Yoga",
      sportType: "Yoga",
      startDateLocal: "2026-07-13T07:30:00",
      elapsedTimeSeconds: 1800,
      distanceMeters: undefined,
      description: undefined,
      trainer: undefined,
      commute: undefined,
    });
    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain('Created activity 9001 ("Morning Yoga")');
    expect(text).toContain("Yoga, 30:00");
    expect(text).toContain("https://www.strava.com/activities/9001");
  });

  it("passes optional fields through and reports the distance", async () => {
    mockedPost.mockResolvedValueOnce(
      createdActivity({ id: "42", name: "Treadmill 5k", sport_type: "Run" }),
    );

    const result = await createActivityTool.execute({
      name: "Treadmill 5k",
      sportType: "Run",
      startDateLocal: "2026-07-13T06:00:00",
      elapsedTimeSeconds: 1500,
      distanceMeters: 5000,
      description: "Easy effort",
      trainer: true,
      commute: false,
    });

    expect(mockedPost).toHaveBeenCalledWith("test-token", {
      name: "Treadmill 5k",
      sportType: "Run",
      startDateLocal: "2026-07-13T06:00:00",
      elapsedTimeSeconds: 1500,
      distanceMeters: 5000,
      description: "Easy effort",
      trainer: true,
      commute: false,
    });
    expect(result.content[0]?.text).toContain("5.00 km");
  });

  it("adds a scope hint on a 401 error", async () => {
    mockedPost.mockRejectedValueOnce(new Error("Request failed with 401"));

    const result = await createActivityTool.execute(baseInput);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "activity:write scope is missing",
    );
  });

  it("adds a duplicate hint on a 409 conflict", async () => {
    mockedPost.mockRejectedValueOnce(new Error("Strava API Error (409)"));

    const result = await createActivityTool.execute(baseInput);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("likely a duplicate");
  });

  it("reports other failures without a hint", async () => {
    mockedPost.mockRejectedValueOnce(new Error("server exploded"));

    const result = await createActivityTool.execute(baseInput);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("server exploded");
    expect(result.content[0]?.text).not.toContain("activity:write scope");
  });
});

describe("create-activity input schema", () => {
  const schema = createActivityTool.inputSchema;

  it("accepts local ISO datetimes with and without an offset", () => {
    for (const startDateLocal of [
      "2026-07-13T07:30:00",
      "2026-07-13T07:30:00Z",
      "2026-07-13T07:30:00+10:00",
    ]) {
      expect(schema.safeParse({ ...baseInput, startDateLocal }).success).toBe(
        true,
      );
    }
  });

  it("rejects a non-datetime start and a non-positive duration", () => {
    expect(
      schema.safeParse({ ...baseInput, startDateLocal: "yesterday" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...baseInput, elapsedTimeSeconds: 0 }).success,
    ).toBe(false);
  });
});
