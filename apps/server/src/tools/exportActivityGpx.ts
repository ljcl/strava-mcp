import * as fs from "node:fs";
import { z } from "zod";
import { stravaApi } from "../fetchClient";
import { buildGpx } from "../gpxBuilder";
import { decodePolyline } from "../polyline";
import { getActivityById } from "../stravaClient";
import { WRITE_IDEMPOTENT } from "./_annotations";
import { resolveContainedPath } from "./exportPath";

const ExportActivityGpxInputSchema = z.object({
  activityId: z
    .string()
    .regex(/^\d+$/, "Activity ID must contain only digits")
    .describe("The ID of the Strava activity to export."),
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
  try {
    const types = ["latlng", ...GPX_STREAM_KEYS].join(",");
    const endpoint = `/activities/${activityId}/streams/${types}?series_type=time`;
    const response = await stravaApi.get<
      Array<{ type: string; data: unknown[] }>
    >(endpoint, { headers: { Authorization: `Bearer ${token}` } });

    const byType = new Map(response.data.map((s) => [s.type, s.data]));
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
  } catch {
    return null;
  }
}

export const exportActivityGpx = {
  name: "export-activity-gpx",
  description:
    "Exports a Strava activity's recorded track as a GPX file saved to a pre-configured local directory. " +
    "Built from the activity's streams (GPS, time, altitude, heart rate, cadence), since Strava's API has no native activity export. " +
    "Activities without full streams fall back to the map polyline (geometry only, no timestamps or sensor data). " +
    "Use for importing rides/runs into Garmin, route planners, or backups.",
  inputSchema: ExportActivityGpxInputSchema,
  annotations: WRITE_IDEMPOTENT,
  execute: async ({ activityId }: ExportActivityGpxInput) => {
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

    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Error: Missing STRAVA_ACCESS_TOKEN in .env file.",
          },
        ],
        isError: true,
      };
    }

    const exportDir = process.env.ROUTE_EXPORT_PATH;
    if (!exportDir) {
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Error: Missing ROUTE_EXPORT_PATH in .env file. Please configure the directory for saving exports.",
          },
        ],
        isError: true,
      };
    }

    try {
      if (!fs.existsSync(exportDir)) {
        console.error(
          `Export directory ${exportDir} not found, creating it...`,
        );
        fs.mkdirSync(exportDir, { recursive: true });
      } else {
        const stats = fs.statSync(exportDir);
        if (!stats.isDirectory()) {
          return {
            content: [
              {
                type: "text" as const,
                text: `❌ Error: ROUTE_EXPORT_PATH (${exportDir}) is not a valid directory.`,
              },
            ],
            isError: true,
          };
        }
        fs.accessSync(exportDir, fs.constants.W_OK);
      }

      const filename = `activity-${activityId}.gpx`;
      const fullPath = resolveContainedPath(exportDir, filename);
      if (!fullPath) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Error: Refusing to write outside ROUTE_EXPORT_PATH (${exportDir}).`,
            },
          ],
          isError: true,
        };
      }

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

      fs.writeFileSync(fullPath, gpx);

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Activity ${activityId} ("${activity.name}") exported as GPX to: ${fullPath}.${note}`,
          },
        ],
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
