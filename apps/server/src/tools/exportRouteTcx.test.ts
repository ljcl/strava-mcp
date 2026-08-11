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
    process.env.ROUTE_EXPORT_PATH = exportDir;
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.ROUTE_EXPORT_PATH;
    fs.rmSync(exportDir, { recursive: true, force: true });
  });

  it("writes the TCX file into the export directory", async () => {
    mockedFetch.mockResolvedValue("<tcx>data</tcx>");

    const result = await exportRouteTcx.execute(
      { routeId: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    const expectedPath = path.join(exportDir, "route-12345.tcx");
    expect(result.content[0]?.text).toContain(expectedPath);
    expect(fs.readFileSync(expectedPath, "utf8")).toBe("<tcx>data</tcx>");
  });

  it("rejects a non-numeric route id before any fetch or write", async () => {
    const result = await exportRouteTcx.execute(
      {
        routeId: "../../tmp/evil",
      },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must contain only digits");
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(fs.readdirSync(exportDir)).toEqual([]);
  });

  it("returns the TCX inline when no export directory is configured (#245)", async () => {
    // A container path is unreachable over the remote transport, so with no
    // directory the document itself is the only useful answer.
    delete process.env.ROUTE_EXPORT_PATH;
    mockedFetch.mockResolvedValueOnce(
      "<TrainingCenterDatabase>data</TrainingCenterDatabase>",
    );

    const result = await exportRouteTcx.execute(
      { routeId: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "<TrainingCenterDatabase>data</TrainingCenterDatabase>",
    );
    const structured = result.structuredContent as {
      mode: string;
      path: string | null;
      format: string;
      filename: string;
      truncated: boolean;
    };
    expect(structured).toMatchObject({
      mode: "content",
      path: null,
      format: "tcx",
      filename: "route-12345.tcx",
      truncated: false,
    });
  });

  it("returns content on request even when a directory is configured", async () => {
    mockedFetch.mockResolvedValueOnce(
      "<TrainingCenterDatabase>data</TrainingCenterDatabase>",
    );

    const result = await exportRouteTcx.execute(
      { routeId: "12345", output: "content" },
      "test-token",
    );

    expect(result.content[0]?.text).toContain(
      "<TrainingCenterDatabase>data</TrainingCenterDatabase>",
    );
    expect(fs.readdirSync(exportDir)).toEqual([]);
  });

  it("truncates an oversized export with a warning instead of failing", async () => {
    delete process.env.ROUTE_EXPORT_PATH;
    mockedFetch.mockResolvedValueOnce("y".repeat(600 * 1024));

    const result = await exportRouteTcx.execute(
      { routeId: "12345" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("Truncated at");
    expect(result.content[0]?.text).toContain("not open as a valid file");
    expect((result.structuredContent as { truncated: boolean }).truncated).toBe(
      true,
    );
  });

  it("reports the written path in structured output in file mode", async () => {
    mockedFetch.mockResolvedValueOnce(
      "<TrainingCenterDatabase>data</TrainingCenterDatabase>",
    );

    const result = await exportRouteTcx.execute(
      { routeId: "12345" },
      "test-token",
    );

    const structured = result.structuredContent as {
      mode: string;
      path: string;
    };
    expect(structured.mode).toBe("file");
    expect(fs.existsSync(structured.path)).toBe(true);
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
