import { z } from "zod";
import { exportRouteTcx as fetchTcxData } from "../stravaClient";
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
import { ExportOutputSchema, warnOnSchemaDrift } from "./outputs";

const name = "export-route-tcx";

const ExportRouteTcxInputSchema = z.object({
  routeId: z
    .string()
    .regex(/^\d+$/, "Route ID must contain only digits")
    .describe("The ID of the Strava route to export."),
  output: exportOutputInput,
});

type ExportRouteTcxInput = z.infer<typeof ExportRouteTcxInputSchema>;

export const exportRouteTcx = {
  name,
  description:
    "Exports a Strava route as TCX. Returns the TCX document in the response by default on a remote server, " +
    "or writes it to the server's configured export directory when output: 'file'.",
  inputSchema: ExportRouteTcxInputSchema,
  annotations: WRITE_IDEMPOTENT,
  outputSchema: ExportOutputSchema,
  execute: async ({ routeId, output }: ExportRouteTcxInput, token: string) => {
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
      const tcxData = await fetchTcxData(token, routeId);
      const filename = `route-${routeId}.tcx`;

      if (mode === "file") {
        const written = await writeExport(exportDir!, filename, tcxData);
        if (!written.ok) {
          return {
            content: [{ type: "text" as const, text: written.error! }],
            isError: true,
          };
        }
        const structured = {
          resource_id: routeId,
          format: "tcx" as const,
          mode: "file" as const,
          filename,
          path: written.path!,
          bytes: Buffer.byteLength(tcxData, "utf8"),
          truncated: false,
        };
        warnOnSchemaDrift(name, ExportOutputSchema, structured);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Route ${routeId} exported successfully as TCX to: ${written.path}`,
            },
          ],
          structuredContent: structured,
        };
      }

      const payload = capExportContent(tcxData, filename);
      const originalBytes = Buffer.byteLength(tcxData, "utf8");
      const structured = {
        resource_id: routeId,
        format: "tcx" as const,
        mode: "content" as const,
        filename,
        path: null,
        bytes: payload.bytes,
        truncated: payload.truncated,
      };
      warnOnSchemaDrift(name, ExportOutputSchema, structured);

      const header = payload.truncated
        ? `${truncationNotice(originalBytes)}\n\n`
        : `✅ Route ${routeId} exported as TCX (${filename}, ${payload.bytes} bytes).\n\n`;
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
            text: `❌ Error exporting route ${routeId} as TCX: ${errMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};
