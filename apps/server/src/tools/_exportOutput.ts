/**
 * Shared delivery mode for the three export tools.
 *
 * The server's transport is remote Streamable HTTP, so a path like
 * `/data/exports/route-123.gpx` names a file inside a container the caller
 * cannot reach — a file-only export is unusable over the wire. `content` mode
 * returns the document itself; `file` writes it, for local deployments that
 * set `ROUTE_EXPORT_PATH`.
 */

import * as fs from "node:fs/promises";
import { z } from "zod";
import { resolveContainedPath } from "./exportPath";

export type ExportMode = "file" | "content";

/**
 * Deliberately optional rather than defaulted: with `ROUTE_EXPORT_PATH` set,
 * omitting it keeps writing files exactly as before, and without it the tool
 * now works instead of erroring. A published default could only be right for
 * one of those deployments.
 */
export const exportOutputInput = z
  .enum(["file", "content"])
  .optional()
  .describe(
    "How to deliver the export. 'content' returns the document in the response, which is the only mode that works against a remote server. " +
      "'file' writes it to the server's ROUTE_EXPORT_PATH directory and returns the path. Defaults to 'file' when ROUTE_EXPORT_PATH is configured, otherwise 'content'.",
  );

/**
 * Cap on inlined export size. A long ride's GPX runs to megabytes, which no
 * host wants in a single content block; past this the document is cut and
 * clearly labelled — see `truncationNotice` for why that is not pretended to
 * be a usable file.
 */
export const MAX_EXPORT_CONTENT_BYTES = 512 * 1024;

/** Resolve the mode actually used, given what the caller asked for. */
export function resolveExportMode(
  requested: ExportMode | undefined,
  exportDir: string | undefined,
): ExportMode {
  if (requested) return requested;
  return exportDir ? "file" : "content";
}

export interface ExportPayload {
  /** The document itself. */
  data: string;
  /** Suggested filename, also used for the on-disk name in file mode. */
  filename: string;
  /** Bytes actually delivered (after any truncation). */
  bytes: number;
  truncated: boolean;
}

/** Cut `data` to the byte cap, if it exceeds it. */
export function capExportContent(
  data: string,
  filename: string,
): ExportPayload {
  const full = Buffer.byteLength(data, "utf8");
  if (full <= MAX_EXPORT_CONTENT_BYTES) {
    return { data, filename, bytes: full, truncated: false };
  }
  const cut = Buffer.from(data, "utf8")
    .subarray(0, MAX_EXPORT_CONTENT_BYTES)
    .toString("utf8");
  return {
    data: cut,
    filename,
    bytes: Buffer.byteLength(cut, "utf8"),
    truncated: true,
  };
}

/**
 * What to say about a truncated export. Truncating XML mid-document leaves a
 * file no GPS tool will open, so the notice says that outright rather than
 * handing back something that looks complete.
 */
export function truncationNotice(originalBytes: number): string {
  return (
    `⚠️ Truncated at ${Math.round(MAX_EXPORT_CONTENT_BYTES / 1024)} KB of ${Math.round(originalBytes / 1024)} KB. ` +
    `The text below is cut mid-document and will not open as a valid file — ` +
    `re-run with output: "file" on a server with ROUTE_EXPORT_PATH set to get the whole export.`
  );
}

export interface WriteExportResult {
  ok: boolean;
  /** Absolute path written, when ok. */
  path?: string;
  /** User-facing failure message, when not ok. */
  error?: string;
}

/**
 * Write an export to `exportDir`, under a containment guard and the
 * directory checks. Async `fs` — these run on the request path of a server
 * handling other calls.
 */
export async function writeExport(
  exportDir: string,
  filename: string,
  data: string,
): Promise<WriteExportResult> {
  const fullPath = resolveContainedPath(exportDir, filename);
  if (!fullPath) {
    return {
      ok: false,
      error: `❌ Error: Refusing to write outside ROUTE_EXPORT_PATH (${exportDir}).`,
    };
  }

  try {
    const stats = await fs.stat(exportDir).catch(() => null);
    if (!stats) {
      console.error(`Export directory ${exportDir} not found, creating it...`);
      await fs.mkdir(exportDir, { recursive: true });
    } else if (!stats.isDirectory()) {
      return {
        ok: false,
        error: `❌ Error: ROUTE_EXPORT_PATH (${exportDir}) is not a valid directory.`,
      };
    }
    await fs.writeFile(fullPath, data);
    return { ok: true, path: fullPath };
  } catch (err: unknown) {
    const code =
      err instanceof Error && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EACCES") {
      return {
        ok: false,
        error: `❌ Error: No write permission for ROUTE_EXPORT_PATH directory (${exportDir}).`,
      };
    }
    return {
      ok: false,
      error: `❌ Error writing ${filename}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** The `file` mode error when no directory is configured. */
export function missingExportDirError(): string {
  return (
    '❌ Error: output: "file" needs ROUTE_EXPORT_PATH configured on the server. ' +
    'Omit `output` or pass output: "content" to receive the export in the response instead.'
  );
}
