import { beforeEach, describe, expect, it, vi } from "vitest";
import { handledNotFound, handledRateLimit } from "../__fixtures__";
import { getRouteById, type StravaRoute } from "../stravaClient";
import { getRouteTool } from "./getRoute";

vi.mock("../stravaClient", () => ({
  getRouteById: vi.fn(),
}));

const mockedGetRoute = vi.mocked(getRouteById);

const route = {
  id: "42",
  name: "River Loop",
  type: 2,
  distance: 12500,
  elevation_gain: 180,
  created_at: "2026-01-15T10:00:00Z",
  segments: [{ id: 1 }, { id: 2 }],
} as unknown as StravaRoute;

describe("get-route input schema", () => {
  const schema = getRouteTool.inputSchema;

  it("accepts a digit-string id", () => {
    expect(schema.safeParse({ routeId: "42" }).success).toBe(true);
  });

  it("rejects a non-numeric id", () => {
    expect(schema.safeParse({ routeId: "abc" }).success).toBe(false);
  });
});

describe("get-route execute", () => {
  beforeEach(() => {
    mockedGetRoute.mockReset();
  });

  it("formats the route summary", async () => {
    mockedGetRoute.mockResolvedValueOnce(route);

    const result = await getRouteTool.execute({ routeId: "42" }, "test-token");

    expect(result.isError).toBeUndefined();
    expect(mockedGetRoute).toHaveBeenCalledWith("test-token", "42");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("River Loop");
    expect(text).toContain("Run");
    expect(text).toContain("12.50 km");
    expect(text).toContain("Segments: 2");
  });

  it("maps a 404 to a route-not-found message", async () => {
    mockedGetRoute.mockRejectedValueOnce(handledNotFound("getRouteById"));

    const result = await getRouteTool.execute({ routeId: "42" }, "test-token");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("❌ Route with ID 42 not found.");
  });

  it("renders the rate-limit window on a RateLimitError", async () => {
    mockedGetRoute.mockRejectedValueOnce(handledRateLimit("getRouteById"));

    const result = await getRouteTool.execute({ routeId: "42" }, "test-token");

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.startsWith("❌")).toBe(true);
    expect(text).toContain("rate limit");
    expect(text).toContain("15-minute rate limit reached (100/100 requests).");
  });

  it("reports other failures with details", async () => {
    mockedGetRoute.mockRejectedValueOnce(new Error("Service unavailable"));

    const result = await getRouteTool.execute({ routeId: "42" }, "test-token");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Service unavailable");
  });
});
