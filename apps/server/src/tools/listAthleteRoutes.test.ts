import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledRateLimit } from "../__fixtures__";
import {
  listAthleteRoutes as fetchAthleteRoutes,
  type StravaRoute,
} from "../stravaClient";
import { listAthleteRoutesTool } from "./listAthleteRoutes";

vi.mock("../stravaClient", () => ({
  listAthleteRoutes: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAthleteRoutes);

const route = {
  id: "42",
  name: "River Loop",
  type: 2,
  distance: 12500,
  elevation_gain: 180,
  created_at: "2026-01-15T10:00:00Z",
} as unknown as StravaRoute;

describe("list-athlete-routes execute", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("lists routes with pagination args passed through", async () => {
    mockedFetch.mockResolvedValueOnce([route]);

    const result = await listAthleteRoutesTool.execute(
      { page: 2, perPage: 5 },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", 2, 5);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Athlete Routes (Page 2)");
    expect(text).toContain("River Loop");
    expect(text).toContain("12.5 km");
    expect(text).toContain("Type: Run");
  });

  it("reports no routes without an error flag", async () => {
    mockedFetch.mockResolvedValueOnce([]);

    const result = await listAthleteRoutesTool.execute(
      {
        page: 1,
        perPage: 20,
      },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("No routes found");
  });

  it("returns isError when the fetch fails", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Server error"));

    const result = await listAthleteRoutesTool.execute(
      {
        page: 1,
        perPage: 20,
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "❌ Failed to list athlete routes (page 1): Server error",
    );
  });

  it("renders the rate-limit window on a RateLimitError", async () => {
    mockedFetch.mockRejectedValueOnce(handledRateLimit("listAthleteRoutes"));

    const result = await listAthleteRoutesTool.execute(
      {
        page: 1,
        perPage: 20,
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.startsWith("❌")).toBe(true);
    expect(text).toContain("rate limit");
    expect(text).toContain("15-minute rate limit reached (100/100 requests).");
  });
});
