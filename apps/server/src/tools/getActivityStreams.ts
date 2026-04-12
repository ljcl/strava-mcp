import { z } from "zod";
import { HttpError, stravaApi } from "../fetchClient";
import { getActivityById } from "../stravaClient";
import { isRunningActivity, metersPerSecToPace } from "../utils/running";

// Define stream types available in Strava API
const STREAM_TYPES = [
  "time",
  "distance",
  "latlng",
  "altitude",
  "velocity_smooth",
  "heartrate",
  "cadence",
  "watts",
  "temp",
  "moving",
  "grade_smooth",
] as const;

// Define resolution types
const RESOLUTION_TYPES = ["low", "medium", "high"] as const;

// Input schema using Zod
export const inputSchema = z.object({
  id: z
    .number()
    .or(z.string())
    .describe(
      "The Strava activity identifier. Obtainable from activity URLs or get-recent-activities.",
    ),
  types: z
    .array(z.enum(STREAM_TYPES))
    .default(["time", "heartrate", "cadence", "watts"])
    .describe(
      "Stream types to fetch. Available: time, distance, latlng, altitude, " +
        "velocity_smooth, heartrate, cadence, watts, temp, moving, grade_smooth",
    ),
  resolution: z
    .enum(RESOLUTION_TYPES)
    .default("medium")
    .describe(
      "Data density: low (~100 points), medium (~1000 points), high (~10000 points). " +
        "Medium is recommended for most analysis.",
    ),
  series_type: z
    .enum(["time", "distance"])
    .optional()
    .default("time")
    .describe("Index series: time (seconds) or distance (meters)."),
});

// Type for the input parameters
type GetActivityStreamsParams = z.infer<typeof inputSchema>;

// Stream interfaces based on Strava API types
interface StreamStatistics {
  total_points: number;
  resolution: string;
  series_type: string;
  max?: number;
  min?: number;
  avg?: number;
  normalized_power?: number;
  max_kph?: number;
  avg_kph?: number;
  avg_pace_min_per_km?: string;
  avg_pace_min_per_mile?: string;
}

interface BaseStream {
  type: string;
  data: unknown[];
  series_type: "distance" | "time";
  original_size: number;
  resolution: "low" | "medium" | "high";
}

interface TimeStream extends BaseStream {
  type: "time";
  data: number[]; // seconds
}

interface DistanceStream extends BaseStream {
  type: "distance";
  data: number[]; // meters
}

interface LatLngStream extends BaseStream {
  type: "latlng";
  data: [number, number][]; // [latitude, longitude]
}

interface AltitudeStream extends BaseStream {
  type: "altitude";
  data: number[]; // meters
}

interface VelocityStream extends BaseStream {
  type: "velocity_smooth";
  data: number[]; // meters per second
}

interface HeartrateStream extends BaseStream {
  type: "heartrate";
  data: number[]; // beats per minute
}

interface CadenceStream extends BaseStream {
  type: "cadence";
  data: number[]; // rpm
}

interface PowerStream extends BaseStream {
  type: "watts";
  data: number[]; // watts
}

interface TempStream extends BaseStream {
  type: "temp";
  data: number[]; // celsius
}

interface MovingStream extends BaseStream {
  type: "moving";
  data: boolean[];
}

interface GradeStream extends BaseStream {
  type: "grade_smooth";
  data: number[]; // percent grade
}

type StreamSet = (
  | TimeStream
  | DistanceStream
  | LatLngStream
  | AltitudeStream
  | VelocityStream
  | HeartrateStream
  | CadenceStream
  | PowerStream
  | TempStream
  | MovingStream
  | GradeStream
)[];

// Type for a single stream element
type Stream =
  | TimeStream
  | DistanceStream
  | LatLngStream
  | AltitudeStream
  | VelocityStream
  | HeartrateStream
  | CadenceStream
  | PowerStream
  | TempStream
  | MovingStream
  | GradeStream;

// Tool definition
export const getActivityStreamsTool = {
  name: "get-activity-streams",
  description:
    "Retrieves time-series data streams from a Strava activity as columnar arrays. " +
    "Returns a units header describing each stream, summary statistics, and flat arrays. " +
    "Default resolution is medium (~1000 points). " +
    "Running activities get pace (min/km) and cadence (steps/min). " +
    "Cycling activities get speed (km/h) and cadence (rpm).",
  inputSchema,
  execute: async ({
    id,
    types,
    resolution,
    series_type,
  }: GetActivityStreamsParams) => {
    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Missing STRAVA_ACCESS_TOKEN in .env",
          },
        ],
        isError: true,
      };
    }

    try {
      // Fetch activity details to get the activity type for proper transformations
      const numericId = typeof id === "string" ? Number.parseInt(id, 10) : id;
      const activity = await getActivityById(token, numericId);
      const activityType = activity.type;
      const isRunning = isRunningActivity(activityType);

      // Build query parameters - resolution always has a default now
      const params: Record<string, string> = {
        resolution,
      };
      if (series_type) params.series_type = series_type;

      // Convert query params to string
      const queryString = new URLSearchParams(params).toString();

      // Build the endpoint URL with types in the path
      const endpoint = `/activities/${id}/streams/${types.join(",")}${queryString ? `?${queryString}` : ""}`;

      const response = await stravaApi.get<StreamSet>(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const streams = response.data;

      if (!streams || streams.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No streams returned. The activity may lack this data or the stream types may be unavailable.",
            },
          ],
          isError: true,
        };
      }

      // At this point we know streams[0] exists because we checked length > 0
      const referenceStream = streams[0]!;
      const totalPoints = referenceStream.data.length;

      // Generate stream statistics first (they're always included)
      const streamStats: Record<string, StreamStatistics> = {};
      streams.forEach((stream: Stream) => {
        const data = stream.data;
        let stats: StreamStatistics = {
          total_points: data.length,
          resolution: stream.resolution,
          series_type: stream.series_type,
        };

        // Add type-specific statistics
        switch (stream.type) {
          case "heartrate": {
            const hrData = data as number[];
            stats = {
              ...stats,
              max: Math.max(...hrData),
              min: Math.min(...hrData),
              avg: Math.round(
                hrData.reduce((a, b) => a + b, 0) / hrData.length,
              ),
            };
            break;
          }
          case "watts": {
            const powerData = data as number[];
            stats = {
              ...stats,
              max: Math.max(...powerData),
              avg: Math.round(
                powerData.reduce((a, b) => a + b, 0) / powerData.length,
              ),
              normalized_power: calculateNormalizedPower(powerData),
            };
            break;
          }
          case "velocity_smooth": {
            const velocityData = data as number[];
            const avgMps =
              velocityData.reduce((a, b) => a + b, 0) / velocityData.length;
            const avgPace = metersPerSecToPace(avgMps);
            stats = {
              ...stats,
              max_kph: Math.round(Math.max(...velocityData) * 3.6 * 10) / 10,
              avg_kph: Math.round(avgMps * 3.6 * 10) / 10,
              // Add pace for running activities
              ...(isRunning && avgPace
                ? {
                    avg_pace_min_per_km: avgPace.minPerKm,
                    avg_pace_min_per_mile: avgPace.minPerMile,
                  }
                : {}),
            };
            break;
          }
          default:
            break;
        }

        streamStats[stream.type] = stats;
      });

      // Build columnar output
      const units: Record<string, string> = {};
      const columnar: Record<string, unknown[]> = {};

      for (const stream of streams) {
        switch (stream.type) {
          case "time":
            units.time = "seconds";
            columnar.time = stream.data;
            break;
          case "distance":
            units.distance = "meters";
            columnar.distance = (stream.data as number[]).map(
              (m) => Math.round(m * 10) / 10,
            );
            break;
          case "heartrate":
            units.heartrate = "bpm";
            columnar.heartrate = stream.data;
            break;
          case "watts":
            units.power = "watts";
            columnar.power = stream.data;
            break;
          case "cadence": {
            const raw = stream.data as number[];
            if (isRunning) {
              units.cadence = "spm";
              columnar.cadence = raw.map((v) => v * 2);
            } else {
              units.cadence = "rpm";
              columnar.cadence = raw;
            }
            break;
          }
          case "velocity_smooth": {
            const velocities = stream.data as number[];
            if (isRunning) {
              units.pace = "min/km";
              columnar.pace = velocities.map((mps) =>
                mps > 0 ? Math.round((1000 / mps / 60) * 100) / 100 : 0,
              );
            } else {
              units.speed = "km/h";
              columnar.speed = velocities.map(
                (mps) => Math.round(mps * 3.6 * 10) / 10,
              );
            }
            break;
          }
          case "altitude":
            units.altitude = "meters";
            columnar.altitude = (stream.data as number[]).map(
              (v) => Math.round(v * 10) / 10,
            );
            break;
          case "grade_smooth":
            units.grade = "percent";
            columnar.grade = (stream.data as number[]).map(
              (v) => Math.round(v * 10) / 10,
            );
            break;
          case "temp":
            units.temp = "celsius";
            columnar.temp = stream.data;
            break;
          case "latlng":
            units.latlng = "[lat, lng]";
            columnar.latlng = stream.data;
            break;
          case "moving":
            units.moving = "boolean";
            columnar.moving = stream.data;
            break;
        }
      }

      const result = {
        activity: {
          name: activity.name,
          type: activityType,
          duration: activity.moving_time,
          distance: activity.distance
            ? Math.round(activity.distance / 10) / 100
            : undefined,
        },
        points: totalPoints,
        resolution: referenceStream.resolution,
        units,
        statistics: streamStats,
        streams: columnar,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error: unknown) {
      const statusCode =
        error instanceof HttpError ? error.response.status : undefined;
      const errorMessage =
        error instanceof HttpError
          ? error.response.data
          : error instanceof Error
            ? error.message
            : String(error);

      let userFriendlyError = `Failed to fetch activity streams (${statusCode}): ${errorMessage}\n\n`;
      userFriendlyError += "This could be because:\n";
      userFriendlyError += "1. The activity ID is invalid\n";
      userFriendlyError +=
        "2. You don't have permission to view this activity\n";
      userFriendlyError += "3. The requested stream types are not available\n";
      userFriendlyError +=
        "4. The activity is too old and the streams have been archived";

      return {
        content: [
          {
            type: "text" as const,
            text: userFriendlyError,
          },
        ],
        isError: true,
      };
    }
  },
};

// Helper function to calculate normalized power
function calculateNormalizedPower(powerData: number[]): number {
  if (powerData.length < 30) return 0;

  // 30-second moving average
  const windowSize = 30;
  const movingAvg = [];
  for (let i = windowSize - 1; i < powerData.length; i += 1) {
    const window = powerData.slice(i - windowSize + 1, i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / windowSize;
    movingAvg.push(avg ** 4);
  }

  // Calculate normalized power
  const avgPower =
    (movingAvg.reduce((a, b) => a + b, 0) / movingAvg.length) ** 0.25;

  return Math.round(avgPower);
}
