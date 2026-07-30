import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRouteProfile } from "../routeProfile";
import { getRouteById, type StravaRoute } from "../stravaClient";
import { getRoutePreviewTool } from "./getRoutePreview";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return { ...actual, getRouteById: vi.fn() };
});
vi.mock("../routeProfile", () => ({ loadRouteProfile: vi.fn() }));

const mockedRoute = vi.mocked(getRouteById);
const mockedProfile = vi.mocked(loadRouteProfile);

const route = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "456",
    name: "Kinglake Loop",
    type: 1,
    distance: 20000,
    elevation_gain: 420,
    ...overrides,
  }) as unknown as StravaRoute;

/** Distance + altitude for `pitches` of `[lengthM, gradePct]`, every 10 m. */
const elevation = (
  pitches: Array<[number, number]>,
  source: "streams" | "gpx" = "streams",
) => {
  const distance = [0];
  const altitude = [100];
  for (const [lengthM, gradePct] of pitches) {
    for (let i = 0; i < Math.round(lengthM / 10); i++) {
      distance.push(distance[distance.length - 1]! + 10);
      altitude.push(altitude[altitude.length - 1]! + gradePct / 10);
    }
  }
  return { source, coordinates: [], distance, altitude };
};

describe("get-route-preview execute", () => {
  beforeEach(() => {
    mockedRoute.mockReset();
    mockedProfile.mockReset();
  });

  it("names each climb with its position, grade, and length", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce(
      elevation([
        [4000, 0],
        [1500, 7],
        [3000, -2],
        [1500, 6],
        [10000, 0],
      ]),
    );

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Kinglake Loop");
    expect(text).toContain("sustained climbs");
    const climbs = result.structuredContent?.profile.climbs ?? [];
    expect(climbs).toHaveLength(2);
    expect(climbs[0]?.grade_pct).toBeCloseTo(7, 0);
    // The first climb starts 4 km in, a fifth of the way round.
    expect(climbs[0]?.start_m).toBeCloseTo(4000, -2);
    expect(result.structuredContent?.elevation_source).toBe("streams");
  });

  it("answers 'how bad is the climb at 14 km' with the crux position", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce(
      elevation([
        [14000, 0],
        [1000, 11],
        [5000, 0],
      ]),
    );

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    const crux = result.structuredContent?.profile.steepest;
    expect(crux?.grade_pct).toBeCloseTo(11, 0);
    expect(crux?.start_m).toBeCloseTo(14000, -2);
    expect(result.content[0]?.text).toContain("Steepest");
  });

  it("reports the route's own stored gain, not the derived one", async () => {
    mockedRoute.mockResolvedValueOnce(route({ elevation_gain: 420 }));
    mockedProfile.mockResolvedValueOnce(elevation([[1000, 5]]));

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.structuredContent?.elevation_gain_m).toBe(420);
    expect(result.content[0]?.text).toContain("+420 m total gain");
  });

  it("labels the route type from Strava's enum", async () => {
    mockedRoute.mockResolvedValueOnce(route({ type: 2 }));
    mockedProfile.mockResolvedValueOnce(elevation([[1000, 5]]));

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.structuredContent?.type).toBe("Run");
  });

  it("discloses when the profile came from the GPX fallback", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce(elevation([[1000, 5]], "gpx"));

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.elevation_source).toBe("gpx");
    expect(result.content[0]?.text).toContain("read from its GPX export");
    expect(result.structuredContent?.warnings.join(" ")).toContain(
      "GPX export",
    );
  });

  it("says a route has no recoverable elevation rather than showing a flat profile", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockResolvedValueOnce(null);

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no stored elevation profile");
    expect(result.content[0]?.text).toContain("get-route still reports");
  });

  it("surfaces a rate-limit failure instead of a missing profile", async () => {
    mockedRoute.mockResolvedValueOnce(route());
    mockedProfile.mockRejectedValueOnce(
      new Error("Strava rate limit exceeded in getRouteStreams for ID 456."),
    );

    const result = await getRoutePreviewTool.execute(
      { routeId: "456" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("rate limit");
  });
});
