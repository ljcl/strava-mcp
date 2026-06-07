import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityById as fetchActivityById,
  updateActivity as putActivity,
  type StravaDetailedActivity,
} from "../stravaClient";
import { updateActivityTool } from "./updateActivity";

vi.mock("../stravaClient", () => ({
  getActivityById: vi.fn(),
  updateActivity: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchActivityById);
const mockedPut = vi.mocked(putActivity);

function updatedActivity(
  overrides: Partial<StravaDetailedActivity> = {},
): StravaDetailedActivity {
  return {
    id: "555",
    name: "Morning Run",
    sport_type: "Run",
    gear: null,
    description: null,
    ...overrides,
  } as unknown as StravaDetailedActivity;
}

describe("updateActivityTool.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
    mockedPut.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await updateActivityTool.execute({ activityId: 555 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it("rejects a call with no mutating fields", async () => {
    const result = await updateActivityTool.execute({ activityId: 555 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Nothing to update");
    expect(mockedPut).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("sends only the provided fields in the write payload", async () => {
    mockedPut.mockResolvedValueOnce(
      updatedActivity({ name: "Evening Ride", sport_type: "Ride" }),
    );

    await updateActivityTool.execute({
      activityId: 555,
      name: "Evening Ride",
      sportType: "Ride",
      commute: true,
    });

    expect(mockedPut).toHaveBeenCalledWith("test-token", 555, {
      name: "Evening Ride",
      description: undefined,
      sportType: "Ride",
      gearId: undefined,
      commute: true,
      trainer: undefined,
      hideFromHome: undefined,
    });
    // No description means no read-modify-write fetch.
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("appends to the existing description by default", async () => {
    mockedFetch.mockResolvedValueOnce(
      updatedActivity({ description: "Existing notes" }),
    );
    mockedPut.mockResolvedValueOnce(updatedActivity());

    const result = await updateActivityTool.execute({
      activityId: 555,
      description: "New line",
    });

    expect(mockedFetch).toHaveBeenCalledWith("test-token", 555);
    expect(mockedPut).toHaveBeenCalledWith(
      "test-token",
      555,
      expect.objectContaining({ description: "Existing notes\n\nNew line" }),
    );
    expect(result.content[0]?.text).toContain("description (append)");
  });

  it("replaces the description without fetching the current value", async () => {
    mockedPut.mockResolvedValueOnce(updatedActivity());

    const result = await updateActivityTool.execute({
      activityId: 555,
      description: "Fresh text",
      descriptionMode: "replace",
    });

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedPut).toHaveBeenCalledWith(
      "test-token",
      555,
      expect.objectContaining({ description: "Fresh text" }),
    );
    expect(result.content[0]?.text).toContain("description (replace)");
  });

  it("summarizes every changed field", async () => {
    mockedPut.mockResolvedValueOnce(
      updatedActivity({
        name: "Tempo",
        sport_type: "TrailRun",
        gear: { id: "g1", name: "Peg Trail" } as StravaDetailedActivity["gear"],
      }),
    );

    const result = await updateActivityTool.execute({
      activityId: 555,
      name: "Tempo",
      sportType: "TrailRun",
      gearId: "g1",
      trainer: true,
      hideFromHome: true,
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain('name to "Tempo"');
    expect(text).toContain("sport type to TrailRun");
    expect(text).toContain("gear to Peg Trail");
    expect(text).toContain("trainer=true");
    expect(text).toContain("hideFromHome=true");
  });

  it("adds a scope hint on a 401 error", async () => {
    mockedPut.mockRejectedValueOnce(new Error("Request failed with 401"));

    const result = await updateActivityTool.execute({
      activityId: 555,
      name: "x",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "activity:write scope is missing",
    );
  });

  it("reports other failures without the scope hint", async () => {
    mockedPut.mockRejectedValueOnce(new Error("server exploded"));

    const result = await updateActivityTool.execute({
      activityId: 555,
      name: "x",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("server exploded");
    expect(result.content[0]?.text).not.toContain("activity:write scope");
  });
});
