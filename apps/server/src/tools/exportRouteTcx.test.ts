import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportRouteTcx as fetchTcxData } from "../stravaClient";
import { exportRouteTcx } from "./exportRouteTcx";

vi.mock("../stravaClient", () => ({
  exportRouteTcx: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchTcxData);

describe("exportRouteTcx.execute", () => {
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

  it("writes the TCX file into the export directory", async () => {
    mockedFetch.mockResolvedValue("<tcx>data</tcx>");

    const result = await exportRouteTcx.execute({ routeId: "12345" });

    expect(result.isError).toBeUndefined();
    const expectedPath = path.join(exportDir, "route-12345.tcx");
    expect(result.content[0]?.text).toContain(expectedPath);
    expect(fs.readFileSync(expectedPath, "utf8")).toBe("<tcx>data</tcx>");
  });

  it("rejects a non-numeric route id before any fetch or write", async () => {
    const result = await exportRouteTcx.execute({
      routeId: "../../tmp/evil",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must contain only digits");
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(fs.readdirSync(exportDir)).toEqual([]);
  });

  it("declares the digits-only constraint in the input schema", () => {
    const parsed = exportRouteTcx.inputSchema.safeParse({
      routeId: "../../tmp/evil",
    });
    expect(parsed.success).toBe(false);
    expect(
      exportRouteTcx.inputSchema.safeParse({ routeId: "12345" }).success,
    ).toBe(true);
  });
});
