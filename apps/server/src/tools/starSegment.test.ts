import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type StravaDetailedSegment,
  starSegment as updateStarStatus,
} from "../stravaClient";
import { starSegment } from "./starSegment";

vi.mock("../stravaClient", () => ({
  starSegment: vi.fn(),
}));

const mockedStar = vi.mocked(updateStarStatus);

const segment = {
  id: 789,
  name: "Box Hill Climb",
  starred: true,
} as unknown as StravaDetailedSegment;

describe("star-segment execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedStar.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("stars a segment and reports the new starred state", async () => {
    mockedStar.mockResolvedValueOnce(segment);

    const result = await starSegment.execute(
      {
        segmentId: "789",
        starred: true,
      },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(mockedStar).toHaveBeenCalledWith("test-token", "789", true);
    expect(result.content[0]?.text).toContain("starring");
    expect(result.content[0]?.text).toContain("Box Hill Climb");
    expect(result.content[0]?.text).toContain("true");
  });

  it("unstars a segment", async () => {
    mockedStar.mockResolvedValueOnce({
      ...segment,
      starred: false,
    } as unknown as StravaDetailedSegment);

    const result = await starSegment.execute(
      {
        segmentId: "789",
        starred: false,
      },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(mockedStar).toHaveBeenCalledWith("test-token", "789", false);
    expect(result.content[0]?.text).toContain("unstarring");
  });

  it("returns isError when the write fails", async () => {
    mockedStar.mockRejectedValueOnce(new Error("Forbidden"));

    const result = await starSegment.execute(
      {
        segmentId: "789",
        starred: true,
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Failed to star segment 789");
    expect(result.content[0]?.text).toContain("Forbidden");
  });
});
