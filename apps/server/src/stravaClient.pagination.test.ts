import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicRunActivity, rideActivity } from "./__fixtures__";
import { stravaApi } from "./fetchClient";
import {
  getAllActivities,
  listAllStarredSegments,
  listStarredSegments,
  STARRED_SEGMENTS_DEFAULT_PER_PAGE,
  STARRED_SEGMENTS_MAX_PAGES,
} from "./stravaClient";

vi.mock("./fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchClient")>();
  return {
    ...actual,
    stravaApi: { get: vi.fn(), put: vi.fn() },
  };
});

const mockedGet = vi.mocked(stravaApi.get);

const run = (id: number) => ({ ...basicRunActivity, id });
const ride = (id: number) => ({ ...rideActivity, id });

const page = (activities: unknown[]) => ({ data: activities });

describe("getAllActivities pagination bounds", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("pages until a short page when no cap is set", async () => {
    mockedGet
      .mockResolvedValueOnce(page([run(1), run(2)]))
      .mockResolvedValueOnce(page([run(3)]));

    const activities = await getAllActivities("test-token", { perPage: 2 });

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(activities).toHaveLength(3);
  });

  // Regression for #111: get-best-efforts used to walk the athlete's whole
  // history before applying maxActivities, burning the rate quota.
  it("stops fetching once maxItems activities have been collected", async () => {
    mockedGet
      .mockResolvedValueOnce(page([run(1), run(2)]))
      .mockResolvedValueOnce(page([run(3), run(4)]))
      .mockResolvedValueOnce(page([run(5), run(6)]));

    const activities = await getAllActivities("test-token", {
      perPage: 2,
      maxItems: 3,
    });

    // Page 2 satisfies the cap; page 3 is never requested.
    expect(mockedGet).toHaveBeenCalledTimes(2);
    // The satisfying page is returned in full; callers apply their own slice.
    expect(activities).toHaveLength(4);
  });

  it("counts only matching activities toward maxItems via countActivity", async () => {
    const isRun = (a: { type?: string | null }) => a.type === "Run";
    mockedGet
      .mockResolvedValueOnce(page([run(1), ride(2)]))
      .mockResolvedValueOnce(page([ride(3), ride(4)]))
      .mockResolvedValueOnce(page([run(5), ride(6)]))
      .mockResolvedValueOnce(page([run(7), run(8)]));

    const activities = await getAllActivities("test-token", {
      perPage: 2,
      maxItems: 2,
      countActivity: isRun,
    });

    // Two runs only arrive by page 3, so pagination continues past pages
    // full of rides and stops there; page 4 is never requested.
    expect(mockedGet).toHaveBeenCalledTimes(3);
    expect(activities.filter(isRun)).toHaveLength(2);
    expect(activities).toHaveLength(6);
  });
});

describe("listStarredSegments paging", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("sends explicit page and per_page so page two is reachable", async () => {
    mockedGet.mockResolvedValueOnce(page([]));

    await listStarredSegments("test-token", 2, 50);

    expect(mockedGet).toHaveBeenCalledWith(
      "/segments/starred",
      expect.objectContaining({ params: { page: 2, per_page: 50 } }),
    );
  });

  it("defaults to the first page at the documented page size", async () => {
    mockedGet.mockResolvedValueOnce(page([]));

    await listStarredSegments("test-token");

    expect(mockedGet).toHaveBeenCalledWith(
      "/segments/starred",
      expect.objectContaining({
        params: { page: 1, per_page: STARRED_SEGMENTS_DEFAULT_PER_PAGE },
      }),
    );
  });
});

describe("listAllStarredSegments", () => {
  const starred = (id: number) => ({
    id,
    name: `Segment ${id}`,
    activity_type: "Run",
    distance: 1000,
    average_grade: 1,
    maximum_grade: 2,
    elevation_high: 10,
    elevation_low: 5,
    start_latlng: [1, 2],
    end_latlng: [1.1, 2.1],
    climb_category: 0,
    private: false,
  });

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("walks every page until a short one arrives", async () => {
    mockedGet
      .mockResolvedValueOnce(page([starred(1), starred(2)]))
      .mockResolvedValueOnce(page([starred(3)]));

    const segments = await listAllStarredSegments("test-token", 2);

    expect(mockedGet).toHaveBeenCalledTimes(2);
    // Ids normalise to digit strings on the way through the schema.
    expect(segments.map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  it("stops at the page cap rather than paging forever", async () => {
    mockedGet.mockResolvedValue(page([starred(1), starred(2)]));

    const segments = await listAllStarredSegments("test-token", 2);

    expect(mockedGet).toHaveBeenCalledTimes(STARRED_SEGMENTS_MAX_PAGES);
    expect(segments).toHaveLength(STARRED_SEGMENTS_MAX_PAGES * 2);
  });
});
