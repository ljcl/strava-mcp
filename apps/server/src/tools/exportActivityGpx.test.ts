import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityById,
  getActivityStreams,
  type StravaDetailedActivity,
  StreamsUnavailableError,
} from "../stravaClient";
import { exportActivityGpx } from "./exportActivityGpx";

vi.mock("../stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stravaClient")>();
  return {
    ...actual,
    getActivityById: vi.fn(),
    getActivityStreams: vi.fn(),
  };
});

const mockedById = vi.mocked(getActivityById);
const mockedGet = vi.mocked(getActivityStreams);

const asDetail = (a: unknown) => a as unknown as StravaDetailedActivity;

const baseActivity = {
  id: "12345",
  name: "Morning Run",
  type: "Run",
  sport_type: "Run",
  start_date: "2026-07-01T06:00:00Z",
  map: { id: "m1", polyline: "_p~iF~ps|U_ulLnnqC", resource_state: 3 },
};

const streamsResponse = new Map<string, unknown[]>([
  [
    "latlng",
    [
      [-37.8136, 144.9631],
      [-37.8137, 144.9635],
    ],
  ],
  ["time", [0, 5]],
  ["altitude", [30, 31]],
  ["heartrate", [140, 142]],
]);

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

    const result = await exportActivityGpx.execute(
      { activityId: "12345" },
      "test-token",
    );

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
    // No recorded samples (e.g. a manual entry) → the client says so.
    mockedGet.mockRejectedValueOnce(new StreamsUnavailableError("12345"));

    const result = await exportActivityGpx.execute(
      { activityId: "12345" },
      "test-token",
    );

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
    mockedGet.mockRejectedValueOnce(new StreamsUnavailableError("12345"));

    const result = await exportActivityGpx.execute(
      { activityId: "12345" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no GPS data");
    expect(fs.existsSync(path.join(exportDir, "activity-12345.gpx"))).toBe(
      false,
    );
  });

  it("drops misaligned streams instead of writing wrong values", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockResolvedValueOnce(
      new Map<string, unknown[]>([
        [
          "latlng",
          [
            [-37.8136, 144.9631],
            [-37.8137, 144.9635],
          ],
        ],
        ["heartrate", [140]], // length mismatch
      ]),
    );

    await exportActivityGpx.execute({ activityId: "12345" }, "test-token");

    const written = fs.readFileSync(
      path.join(exportDir, "activity-12345.gpx"),
      "utf-8",
    );
    expect(written).not.toContain("gpxtpx:hr");
  });

  it("rejects non-numeric activity ids before any fetch", async () => {
    const result = await exportActivityGpx.execute(
      {
        activityId: "../../etc/passwd",
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(mockedById).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("returns the GPX inline when no export directory is configured (#245)", async () => {
    // The remote-transport case: a container path would be unreachable, so the
    // tool delivers the document itself rather than erroring as it used to.
    delete process.env.ROUTE_EXPORT_PATH;
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockResolvedValueOnce(streamsResponse as never);

    const result = await exportActivityGpx.execute(
      { activityId: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("<gpx");
    expect(result.content[0]?.text).toContain("</gpx>");
    const structured = result.structuredContent as {
      mode: string;
      path: string | null;
      filename: string;
      truncated: boolean;
    };
    expect(structured.mode).toBe("content");
    expect(structured.path).toBeNull();
    expect(structured.filename).toBe("activity-12345.gpx");
    expect(structured.truncated).toBe(false);
  });

  it("still explains itself when file mode is asked for with no directory", async () => {
    delete process.env.ROUTE_EXPORT_PATH;

    const result = await exportActivityGpx.execute(
      { activityId: "12345", output: "file" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ROUTE_EXPORT_PATH");
    expect(result.content[0]?.text).toContain('output: "content"');
    expect(mockedById).not.toHaveBeenCalled();
  });

  it("keeps writing a file when the directory is configured", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockResolvedValueOnce(streamsResponse as never);

    const result = await exportActivityGpx.execute(
      { activityId: "12345" },
      "test-token",
    );

    const structured = result.structuredContent as {
      mode: string;
      path: string;
    };
    expect(structured.mode).toBe("file");
    expect(fs.existsSync(structured.path)).toBe(true);
    // The document is not inlined in file mode — the path is the payload.
    expect(result.content[0]?.text).not.toContain("<gpx");
  });

  it("carries the polyline-fallback caveat into structured output", async () => {
    mockedById.mockResolvedValueOnce(asDetail(baseActivity));
    mockedGet.mockRejectedValueOnce(
      new StreamsUnavailableError("12345", "activity"),
    );

    const result = await exportActivityGpx.execute(
      { activityId: "12345", output: "content" },
      "test-token",
    );

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toContain("geometry-only");
  });
});
