/**
 * Delivery-mode helpers shared by the three export tools (#245).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  capExportContent,
  MAX_EXPORT_CONTENT_BYTES,
  missingExportDirError,
  resolveExportMode,
  truncationNotice,
  writeExport,
} from "./_exportOutput";

describe("resolveExportMode", () => {
  it("honours an explicit request either way", () => {
    expect(resolveExportMode("content", "/exports")).toBe("content");
    expect(resolveExportMode("file", "/exports")).toBe("file");
    expect(resolveExportMode("file", undefined)).toBe("file");
  });

  it("falls back to the mode the deployment can actually serve", () => {
    // Configured directory: unchanged behaviour for existing local installs.
    expect(resolveExportMode(undefined, "/exports")).toBe("file");
    // None configured: content, rather than the error this used to be.
    expect(resolveExportMode(undefined, undefined)).toBe("content");
    expect(resolveExportMode(undefined, "")).toBe("content");
  });
});

describe("capExportContent", () => {
  it("passes a normal export through untouched", () => {
    const payload = capExportContent("<gpx></gpx>", "route-1.gpx");
    expect(payload.truncated).toBe(false);
    expect(payload.data).toBe("<gpx></gpx>");
    expect(payload.bytes).toBe(11);
  });

  it("cuts an oversized export at the cap and says so", () => {
    const huge = "x".repeat(MAX_EXPORT_CONTENT_BYTES + 5000);
    const payload = capExportContent(huge, "route-1.gpx");
    expect(payload.truncated).toBe(true);
    expect(payload.bytes).toBeLessThanOrEqual(MAX_EXPORT_CONTENT_BYTES);
    expect(payload.data.length).toBeLessThan(huge.length);
  });

  it("measures bytes, not characters, so multibyte content cannot overflow", () => {
    const multibyte = "é".repeat(MAX_EXPORT_CONTENT_BYTES);
    const payload = capExportContent(multibyte, "route-1.gpx");
    expect(payload.truncated).toBe(true);
    expect(Buffer.byteLength(payload.data, "utf8")).toBeLessThanOrEqual(
      MAX_EXPORT_CONTENT_BYTES,
    );
  });
});

describe("truncationNotice", () => {
  it("says the cut document will not open, rather than implying it is usable", () => {
    const notice = truncationNotice(2 * MAX_EXPORT_CONTENT_BYTES);
    expect(notice).toContain("not open as a valid file");
    expect(notice).toContain('output: "file"');
  });
});

describe("missingExportDirError", () => {
  it("names the way out, not just the missing variable", () => {
    expect(missingExportDirError()).toContain("ROUTE_EXPORT_PATH");
    expect(missingExportDirError()).toContain('output: "content"');
  });
});

describe("writeExport", () => {
  const dirs: string[] = [];

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "export-out-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the file and returns its path", async () => {
    const dir = tempDir();
    const result = await writeExport(dir, "route-1.gpx", "<gpx/>");

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(result.path!, "utf8")).toBe("<gpx/>");
  });

  it("creates the directory when it does not exist yet", async () => {
    const dir = path.join(tempDir(), "nested", "deeper");
    const result = await writeExport(dir, "route-1.gpx", "<gpx/>");

    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.path!)).toBe(true);
  });

  it("refuses a filename that escapes the export directory", async () => {
    const dir = tempDir();
    const result = await writeExport(dir, "../escaped.gpx", "<gpx/>");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Refusing to write outside");
    expect(fs.existsSync(path.join(dir, "..", "escaped.gpx"))).toBe(false);
  });

  it("reports a path that is not a directory", async () => {
    const dir = tempDir();
    const file = path.join(dir, "not-a-dir");
    fs.writeFileSync(file, "");

    const result = await writeExport(file, "route-1.gpx", "<gpx/>");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not a valid directory");
  });
});
