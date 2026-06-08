import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicRunActivity, rideActivity } from "../__fixtures__";
import {
  getAllActivities as fetchAllActivities,
  type StravaSummaryActivity,
} from "../stravaClient";
import { getAllActivities } from "./getAllActivities";

vi.mock("../stravaClient", () => ({
  getAllActivities: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAllActivities);

// The executor's input type is post-defaults, so the numeric caps are
// required at the type level. This fills them in unless a test overrides.
type Input = Parameters<typeof getAllActivities.execute>[0];
const run = (input: Partial<Input> = {}) =>
  getAllActivities.execute({
    maxActivities: 500,
    maxApiCalls: 10,
    perPage: 200,
    ...input,
  } as Input);

// Builds a page of `count` distinct activities of a given type/sport.
function page(
  count: number,
  overrides: Partial<StravaSummaryActivity> = {},
): StravaSummaryActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    ...(basicRunActivity as unknown as StravaSummaryActivity),
    id: String(1000 + i),
    ...overrides,
  }));
}

describe("getAllActivities.execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("errors when the access token is missing", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await run({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("STRAVA_ACCESS_TOKEN is missing");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("errors when the access token is the placeholder", async () => {
    process.env.STRAVA_ACCESS_TOKEN = "YOUR_STRAVA_ACCESS_TOKEN_HERE";

    const result = await run({});

    expect(result.isError).toBe(true);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("returns a formatted summary with statistics", async () => {
    mockedFetch.mockResolvedValueOnce(page(3));

    const result = await run({ perPage: 200 });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Found 3 activities");
    expect(text).toContain("Total fetched: 3");
    expect(text).toContain("API calls: 1");
    expect(text).toContain("https://www.strava.com/activities/1000");
  });

  it("stops paginating once a short page is returned", async () => {
    // perPage 200 but only 5 returned => hasMore false, no second call.
    mockedFetch.mockResolvedValueOnce(page(5));

    await run({ perPage: 200 });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps paginating across full pages until a short page", async () => {
    mockedFetch.mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(1));

    const result = await run({ perPage: 2 });

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      "test-token",
      expect.objectContaining({ page: 1, perPage: 2 }),
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      "test-token",
      expect.objectContaining({ page: 2, perPage: 2 }),
    );
    expect(result.content[0]?.text).toContain("Total fetched: 3");
  });

  it("respects the maxApiCalls cap", async () => {
    // Every page is full, so only the cap stops the loop.
    mockedFetch.mockResolvedValue(page(2));

    await run({ perPage: 2, maxApiCalls: 3 });

    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it("respects the maxActivities cap and notes truncation", async () => {
    mockedFetch.mockResolvedValue(page(2));

    const result = await run({
      perPage: 2,
      maxActivities: 3,
      maxApiCalls: 10,
    });

    const text = result.content[0]?.text ?? "";
    // Loop stops once filteredActivities.length >= maxActivities (after 2 pages).
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(text).toContain("Found 3 activities");
    expect(text).toContain("Showing first 3 of 4 matching activities");
  });

  it("converts startDate/endDate to epoch before/after params", async () => {
    mockedFetch.mockResolvedValueOnce(page(1));

    await run({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });

    const after = Math.floor(new Date("2024-01-01").getTime() / 1000);
    const before = Math.floor(new Date("2024-12-31").getTime() / 1000);
    expect(mockedFetch).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ before, after }),
    );
  });

  it("rejects an invalid endDate", async () => {
    const result = await run({ endDate: "not-a-date" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid endDate format");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid startDate", async () => {
    const result = await run({ startDate: "nope" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid startDate format");
  });

  it("filters by activity type (case-insensitive)", async () => {
    mockedFetch.mockResolvedValueOnce([
      ...page(2),
      rideActivity as unknown as StravaSummaryActivity,
    ]);

    const result = await run({ activityTypes: ["run"] });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Total fetched: 3");
    expect(text).toContain("Matching filters: 2");
  });

  it("filters by sport type", async () => {
    mockedFetch.mockResolvedValueOnce([
      ...page(2, { sport_type: "TrailRun" }),
      basicRunActivity as unknown as StravaSummaryActivity,
    ]);

    const result = await run({
      sportTypes: ["TrailRun"],
    });

    expect(result.content[0]?.text).toContain("Matching filters: 2");
  });

  it("returns a no-results message when nothing matches", async () => {
    mockedFetch.mockResolvedValueOnce(page(2));

    const result = await run({
      activityTypes: ["Swim"],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "No activities found matching your criteria",
    );
  });

  it("surfaces the structured rate-limit message from the client", async () => {
    // The fetch layer now honours Retry-After and stravaClient builds the
    // actionable message; the tool just passes it through (no 429 string match).
    mockedFetch.mockRejectedValueOnce(
      new Error(
        "Strava rate limit exceeded in getAllActivities. 15-minute rate limit reached (100/100 requests).",
      ),
    );

    const result = await run({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
  });

  it("surfaces other API errors", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom"));

    const result = await run({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("API Error: boom");
  });
});
