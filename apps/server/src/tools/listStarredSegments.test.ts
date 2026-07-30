import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listStarredSegments as fetchSegments,
  getAuthenticatedAthlete,
  type StravaAthlete,
  type StravaSegment,
} from "../stravaClient";
import { listStarredSegments } from "./listStarredSegments";

vi.mock("../stravaClient", () => ({
  listStarredSegments: vi.fn(),
  getAuthenticatedAthlete: vi.fn(),
  STARRED_SEGMENTS_DEFAULT_PER_PAGE: 30,
}));

const mockedSegments = vi.mocked(fetchSegments);
const mockedAthlete = vi.mocked(getAuthenticatedAthlete);

const athlete = (measurement: string) =>
  ({ id: 1, measurement_preference: measurement }) as unknown as StravaAthlete;

const segment = {
  id: 789,
  name: "Box Hill Climb",
  activity_type: "Ride",
  distance: 2500,
  average_grade: 4.9,
  city: "Dorking",
  state: "Surrey",
  country: "United Kingdom",
  private: false,
} as unknown as StravaSegment;

/** `count` distinct starred segments, so a full page can be simulated. */
const page = (count: number): StravaSegment[] =>
  Array.from(
    { length: count },
    (_, i) =>
      ({
        ...segment,
        id: String(1000 + i),
        name: `Segment ${i}`,
      }) as unknown as StravaSegment,
  );

describe("list-starred-segments execute", () => {
  beforeEach(() => {
    mockedSegments.mockReset();
    mockedAthlete.mockReset();
  });

  it("lists starred segments in km for meters preference", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([segment]);

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Box Hill Climb");
    expect(text).toContain("2.50 km");
    expect(text).toContain("Dorking, Surrey, United Kingdom");
  });

  it("converts distance to miles for feet preference", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("feet"));
    mockedSegments.mockResolvedValueOnce([segment]);

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("1.55 mi");
  });

  it("reports no starred segments without an error flag", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([]);

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No starred segments found");
  });

  // The typo this replaced rendered as " MNo starred segments found." (#246).
  it("has no stray characters before the empty-result sentence", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([]);

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.content[0]?.text).toBe("No starred segments found.");
  });

  it("defaults to page 1 at the client's page size", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([segment]);

    await listStarredSegments.execute({}, "test-token");

    expect(mockedSegments).toHaveBeenCalledWith("test-token", 1, 30);
  });

  it("forwards the requested page and page size", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([segment]);

    await listStarredSegments.execute({ page: 3, perPage: 50 }, "test-token");

    expect(mockedSegments).toHaveBeenCalledWith("test-token", 3, 50);
  });

  it("discloses that a full page may be truncated", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce(page(30));

    const result = await listStarredSegments.execute({}, "test-token");

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("more may be available");
    expect(text).toContain("call again with page 2");
  });

  it("says nothing about more pages on a partial page", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce(page(4));

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.content[0]?.text).not.toContain("more may be available");
  });

  it("labels a later page and reports it empty when exhausted", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockResolvedValueOnce([]);

    const result = await listStarredSegments.execute({ page: 4 }, "test-token");

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe("No starred segments on page 4.");
  });

  it("returns isError when the fetch fails", async () => {
    mockedAthlete.mockResolvedValueOnce(athlete("meters"));
    mockedSegments.mockRejectedValueOnce(new Error("Server error"));

    const result = await listStarredSegments.execute({}, "test-token");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Server error");
  });
});
