import { z } from "zod";
import { buildGpx } from "../gpxBuilder";
import { decodePolyline } from "../polyline";
import {
  getActivityById,
  getActivityStreams,
  StreamsUnavailableError,
} from "../stravaClient";
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

const name = "export-activity-gpx";

const ExportActivityGpxInputSchema = z.object({
  activityId: stravaIdInput("The ID of the Strava activity to export."),
  output: exportOutputInput,
});

type ExportActivityGpxInput = z.infer<typeof ExportActivityGpxInputSchema>;

/** Streams the GPX builder consumes, fetched at full resolution. */
const GPX_STREAM_KEYS = ["time", "altitude", "heartrate", "cadence"] as const;

interface GpxStreams {
  coordinates: Array<[number, number]>;
  time?: number[];
  altitude?: number[];
  heartrate?: number[];
  cadence?: number[];
}

/**
 * Fetch full-resolution recorded streams. Returns null when the activity has
 * no GPS stream (trainer/manual entries) — the caller falls back to the
 * encoded polyline, which carries no timestamps or sensor data.
 */
async function fetchGpxStreams(
  token: string,
  activityId: string,
): Promise<GpxStreams | null> {
  let byType: Awaited<ReturnType<typeof getActivityStreams>>;
  try {
    byType = await getActivityStreams(
      token,
      activityId,
      ["latlng", ...GPX_STREAM_KEYS],
      { seriesType: "time" },
    );
  } catch (error) {
    // A sample-less activity falls back to the polyline; an expired token or
    // an exhausted rate limit is a real failure and must not masquerade as
    // one (#237).
    if (error instanceof StreamsUnavailableError) return null;
    throw error;
  }

  const latlng = byType.get("latlng") as Array<[number, number]> | undefined;
  if (!latlng || latlng.length === 0) return null;

  const streams: GpxStreams = { coordinates: latlng };
  for (const key of GPX_STREAM_KEYS) {
    const data = byType.get(key);
    // Only index-aligned streams are usable; a mismatched length would
    // attach the wrong timestamp/sensor value to a point.
    if (Array.isArray(data) && data.length === latlng.length) {
      streams[key] = data as number[];
    }
  }
  return streams;
}

export const exportActivityGpx = {
  name,
  description:
    "Exports a Strava activity's recorded track as a GPX file saved to a pre-configured local directory. " +
    "Built from the activity's streams (GPS, time, altitude, heart rate, cadence), since Strava's API has no native activity export. " +
    "Activities without full streams fall back to the map polyline (geometry only, no timestamps or sensor data). " +
    "Use for importing rides/runs into Garmin, route planners, or backups.",
  inputSchema: ExportActivityGpxInputSchema,
  annotations: WRITE_IDEMPOTENT,
  outputSchema: ExportOutputSchema,
  execute: async (
    { activityId, output }: ExportActivityGpxInput,
    token: string,
  ) => {
    // The id is interpolated into both the API URL and the output filename —
    // reject anything non-numeric before any fetch or write (mirrors the
    // route export tools, #141).
    if (!/^\d+$/.test(activityId)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Error: Invalid activity ID "${activityId}". Activity ID must contain only digits.`,
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
      const filename = `activity-${activityId}.gpx`;

      const [activity, streams] = await Promise.all([
        getActivityById(token, activityId),
        fetchGpxStreams(token, activityId),
      ]);

      let note = "";
      let gpx: string;
      if (streams) {
        gpx = buildGpx({
          name: activity.name,
          activityType: activity.sport_type ?? activity.type,
          startDate: activity.start_date,
          ...streams,
        });
        const extras = GPX_STREAM_KEYS.filter((k) => streams[k]).join(", ");
        note = extras
          ? ` Includes ${streams.coordinates.length} points with ${extras}.`
          : ` Includes ${streams.coordinates.length} points.`;
      } else {
        const encoded =
          activity.map?.polyline || activity.map?.summary_polyline || "";
        const coordinates = decodePolyline(encoded);
        if (coordinates.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `❌ Activity ${activityId} has no GPS data to export (no streams and no map polyline).`,
              },
            ],
            isError: true,
          };
        }
        gpx = buildGpx({
          name: activity.name,
          activityType: activity.sport_type ?? activity.type,
          coordinates,
        });
        note =
          " Note: built from the map polyline (no full streams), so the file is geometry-only — no timestamps or sensor data.";
      }

      if (mode === "file") {
        const written = await writeExport(exportDir!, filename, gpx);
        if (!written.ok) {
          return {
            content: [{ type: "text" as const, text: written.error! }],
            isError: true,
          };
        }
        const structured = {
          resource_id: activityId,
          format: "gpx" as const,
          mode: "file" as const,
          filename,
          path: written.path!,
          bytes: Buffer.byteLength(gpx, "utf8"),
          truncated: false,
          ...(note ? { note: note.trim() } : {}),
        };
        warnOnSchemaDrift(name, ExportOutputSchema, structured);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Activity ${activityId} ("${activity.name}") exported as GPX to: ${written.path}.${note}`,
            },
          ],
          structuredContent: structured,
        };
      }

      const payload = capExportContent(gpx, filename);
      const originalBytes = Buffer.byteLength(gpx, "utf8");
      const structured = {
        resource_id: activityId,
        format: "gpx" as const,
        mode: "content" as const,
        filename,
        path: null,
        bytes: payload.bytes,
        truncated: payload.truncated,
        ...(note ? { note: note.trim() } : {}),
      };
      warnOnSchemaDrift(name, ExportOutputSchema, structured);

      const header = payload.truncated
        ? `${truncationNotice(originalBytes)}\n\n`
        : `✅ Activity ${activityId} ("${activity.name}") exported as GPX (${filename}, ${payload.bytes} bytes).${note}\n\n`;
      return {
        content: [{ type: "text" as const, text: `${header}${payload.data}` }],
        structuredContent: structured,
      };
    } catch (err: unknown) {
      console.error(
        `Error in export-activity-gpx tool for activity ${activityId}:`,
        err,
      );
      const errMessage = err instanceof Error ? err.message : String(err);
      const errCode =
        err instanceof Error && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      let userMessage = `❌ Error exporting activity ${activityId} as GPX: ${errMessage}`;
      if (errCode === "EACCES") {
        userMessage = `❌ Error: No write permission for ROUTE_EXPORT_PATH directory (${exportDir}).`;
      }
      return {
        content: [{ type: "text" as const, text: userMessage }],
        isError: true,
      };
    }
  },
};
