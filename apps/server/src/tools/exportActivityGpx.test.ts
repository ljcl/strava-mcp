import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaApi } from "../fetchClient";
import { getActivityById, type StravaDetailedActivity } from "../stravaClient";
import { exportActivityGpx } from "./exportActivityGpx";

vi.mock("../stravaClient", () => ({
  getActivityById: vi.fn(),
}));

vi.mock("../fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fetchClient")>();
  return {
    ...actual,
    stravaApi: { get: vi.fn() },
  };
});

const mockedById = vi.mocked(getActivityById);
const mockedGet = vi.mocked(stravaApi.get);

const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

const baseActivity = {
  id: "12345",
  name: "Morning Run",
  type: "Run",
  sport_type: "Run",
  start_date: "2026-07-01T06:00:00Z",
  map: { id: "m1", polyline: "_p~iF~ps|U_ulLnnqC", resource_state: 3 },
};

const streamsResponse = {
  data: [
    {
      type: "latlng",
      data: [
        [-37.8136, 144.9631],
        [-37.8137, 144.9635],
      ],
    },
    { type: "time", data: [0, 5] },
    { type: "altitude", data: [30, 31] },
    { type: "heartrate", data: [140, 142] },
  ],
};

describe("exportActivityGpx.execute", () => {
  let exportDir: string;

  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpx-export-"));
    process.env.ROUTE_EXPORT_PATH = exportDir;
    mockedById.mockReset();
    mockedGet.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
    delete process.env.ROUTE_EXPORT_PATH;
    fs.rmSync(exportDir, { recursive: true, force: true });
  });

  it("writes a GPX file built from full streams", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockResolvedValueOnce(streamsResponse);

    const result = await exportActivityGpx.execute({ activityId: "12345" });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("exported as GPX");
    expect(text).toContain("2 points with time, altitude, heartrate");

    const written = fs.readFileSync(
      path.join(exportDir, "activity-12345.gpx"),
      "utf-8",
    );
    expect(written).toContain(`<trkpt lat="-37.8136" lon="144.9631">`);
    expect(written).toContain("<time>2026-07-01T06:00:05.000Z</time>");
    expect(written).toContain("<gpxtpx:hr>142</gpxtpx:hr>");
  });

  it("falls back to the polyline for stream-less activities and says so", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    // No latlng stream (e.g. trainer ride) → fetch helper returns null.
    mockedGet.mockResolvedValueOnce({ data: [] });

    const result = await exportActivityGpx.execute({ activityId: "12345" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("geometry-only");

    const written = fs.readFileSync(
      path.join(exportDir, "activity-12345.gpx"),
      "utf-8",
    );
    expect(written).toContain("<trkpt ");
    expect(written).not.toContain("<time>");
  });

  it("errors when the activity has neither streams nor a polyline", async () => {
    mockedById.mockResolvedValueOnce(asDetail({ ...baseActivity, map: null }));
    mockedGet.mockResolvedValueOnce({ data: [] });

    const result = await exportActivityGpx.execute({ activityId: "12345" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no GPS data");
    expect(fs.existsSync(path.join(exportDir, "activity-12345.gpx"))).toBe(
      false,
    );
  });

  it("drops misaligned streams instead of writing wrong values", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          type: "latlng",
          data: [
            [-37.8136, 144.9631],
            [-37.8137, 144.9635],
          ],
        },
        { type: "heartrate", data: [140] }, // length mismatch
      ],
    });

    await exportActivityGpx.execute({ activityId: "12345" });

    const written = fs.readFileSync(
      path.join(exportDir, "activity-12345.gpx"),
      "utf-8",
    );
    expect(written).not.toContain("gpxtpx:hr");
  });

  it("rejects non-numeric activity ids before any fetch", async () => {
    const result = await exportActivityGpx.execute({
      activityId: "../../etc/passwd",
    });

    expect(result.isError).toBe(true);
    expect(mockedById).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("errors when ROUTE_EXPORT_PATH is not configured", async () => {
    delete process.env.ROUTE_EXPORT_PATH;

    const result = await exportActivityGpx.execute({ activityId: "12345" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ROUTE_EXPORT_PATH");
  });
});
