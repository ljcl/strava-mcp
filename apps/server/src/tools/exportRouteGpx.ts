import { z } from "zod";
import { exportRouteGpx as fetchGpxData } from "../stravaClient";
import { WRITE_IDEMPOTENT } from "./_annotations";
import {
  capExportContent,
  type ExportMode,
  exportOutputInput,
  missingExportDirError,
  resolveExportMode,
  truncationNotice,
  writeExport,
} from "./_exportOutput";
import { stravaIdInput } from "./_ids";
import { ExportOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "export-route-gpx";

const ExportRouteGpxInputSchema = z.object({
  routeId: stravaIdInput("The ID of the Strava route to export."),
  output: exportOutputInput,
});

type ExportRouteGpxInput = z.infer<typeof ExportRouteGpxInputSchema>;

export const exportRouteGpx = {
  name,
  description:
    "Exports a Strava route as GPX. Returns the GPX document in the response by default on a remote server, " +
    "or writes it to the server's configured export directory when output: 'file'.",
  inputSchema: ExportRouteGpxInputSchema,
  annotations: WRITE_IDEMPOTENT,
  outputSchema: ExportOutputSchema,
  execute: async ({ routeId, output }: ExportRouteGpxInput, token: string) => {
    // The id is interpolated into both the API URL and the output filename —
    // reject anything non-numeric before any fetch or write.
    if (!/^\d+$/.test(routeId)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Error: Invalid route ID "${routeId}". Route ID must contain only digits.`,
          },
        ],
        isError: true,
      };
    }

    const exportDir = process.env.ROUTE_EXPORT_PATH;
    const mode: ExportMode = resolveExportMode(output, exportDir);
    if (mode === "file" && !exportDir) {
      return {
        content: [{ type: "text" as const, text: missingExportDirError() }],
        isError: true,
      };
    }

    try {
      const gpxData = await fetchGpxData(token, routeId);
      const filename = `route-${routeId}.gpx`;

      if (mode === "file") {
        const written = await writeExport(exportDir!, filename, gpxData);
        if (!written.ok) {
          return {
            content: [{ type: "text" as const, text: written.error! }],
            isError: true,
          };
        }
        const structured = {
          resource_id: routeId,
          format: "gpx" as const,
          mode: "file" as const,
          filename,
          path: written.path!,
          bytes: Buffer.byteLength(gpxData, "utf8"),
          truncated: false,
        };
        warnOnSchemaDrift(name, ExportOutputSchema, structured);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Route ${routeId} exported successfully as GPX to: ${written.path}`,
            },
          ],
          structuredContent: structured,
        };
      }

      const payload = capExportContent(gpxData, filename);
      const originalBytes = Buffer.byteLength(gpxData, "utf8");
      const structured = {
        resource_id: routeId,
        format: "gpx" as const,
        mode: "content" as const,
        filename,
        path: null,
        bytes: payload.bytes,
        truncated: payload.truncated,
      };
      warnOnSchemaDrift(name, ExportOutputSchema, structured);

      const header = payload.truncated
        ? `${truncationNotice(originalBytes)}\n\n`
        : `✅ Route ${routeId} exported as GPX (${filename}, ${payload.bytes} bytes).\n\n`;
      return {
        content: [{ type: "text" as const, text: `${header}${payload.data}` }],
        structuredContent: structured,
      };
    } catch (err: unknown) {
      console.error(`Error in ${name} tool for route ${routeId}:`, err);
      const errMessage = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Error exporting route ${routeId} as GPX: ${errMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
