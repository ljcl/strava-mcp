import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportRouteGpx as fetchGpxData } from "../stravaClient";
import { exportRouteGpx } from "./exportRouteGpx";

vi.mock("../stravaClient", () => ({
  exportRouteGpx: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchGpxData);

describe("exportRouteGpx.execute", () => {
  let exportDir: string;

  beforeEach(() => {
    exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-export-"));
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    process.env.ROUTE_EXPORT_PATH = exportDir;
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
    delete process.env.ROUTE_EXPORT_PATH;
    fs.rmSync(exportDir, { recursive: true, force: true });
  });

  it("writes the GPX file into the export directory", async () => {
    mockedFetch.mockResolvedValue("<gpx>data</gpx>");

    const result = await exportRouteGpx.execute({ routeId: "12345" });

    expect(result.isError).toBeUndefined();
    const expectedPath = path.join(exportDir, "route-12345.gpx");
    expect(result.content[0]?.text).toContain(expectedPath);
    expect(fs.readFileSync(expectedPath, "utf8")).toBe("<gpx>data</gpx>");
  });

  it("rejects a non-numeric route id before any fetch or write", async () => {
    const result = await exportRouteGpx.execute({
      routeId: "../../tmp/evil",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must contain only digits");
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(fs.readdirSync(exportDir)).toEqual([]);
  });

  it("declares the digits-only constraint in the input schema", () => {
    const parsed = exportRouteGpx.inputSchema.safeParse({
      routeId: "../../tmp/evil",
    });
    expect(parsed.success).toBe(false);
    expect(
      exportRouteGpx.inputSchema.safeParse({ routeId: "12345" }).success,
    ).toBe(true);
  });
});
