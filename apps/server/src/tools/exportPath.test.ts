import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContainedPath } from "./exportPath";

describe("resolveContainedPath", () => {
  const exportDir = path.join(path.sep, "exports");

  it("resolves a plain filename inside the export directory", () => {
    expect(resolveContainedPath(exportDir, "route-123.gpx")).toBe(
      path.join(exportDir, "route-123.gpx"),
    );
  });

  it("resolves a relative export directory to an absolute path", () => {
    const resolved = resolveContainedPath("exports", "route-123.gpx");
    expect(resolved).toBe(path.resolve("exports", "route-123.gpx"));
  });

  it("rejects traversal via .. segments", () => {
    expect(
      resolveContainedPath(exportDir, "route-../../../tmp/evil.gpx"),
    ).toBeNull();
    expect(resolveContainedPath(exportDir, "../evil.gpx")).toBeNull();
  });

  it("rejects an absolute filename", () => {
    expect(resolveContainedPath(exportDir, "/tmp/evil.gpx")).toBeNull();
  });

  it("rejects a filename resolving to the directory itself", () => {
    expect(resolveContainedPath(exportDir, ".")).toBeNull();
  });

  it("rejects escape into a sibling directory sharing the prefix", () => {
    expect(
      resolveContainedPath(exportDir, `..${path.sep}exports-evil${path.sep}x`),
    ).toBeNull();
  });
});
