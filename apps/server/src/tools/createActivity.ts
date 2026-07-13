import { z } from "zod";
import { formatDuration } from "../formatters";
import { createActivity as postActivity } from "../stravaClient";
import { type CreateActivityParams } from "../utils/activityWrite";
import { WRITE_CREATE } from "./_annotations";

const CreateActivityInputSchema = z.object({
  name: z.string().min(1).describe("Activity title, e.g. 'Morning Yoga'."),
  sportType: z
    .string()
    .describe(
      "Strava sport type, e.g. 'Run', 'Ride', 'WeightTraining', 'Yoga', 'Workout'.",
    ),
  startDateLocal: z.iso
    .datetime({ local: true, offset: true })
    .describe(
      "When the activity started, as ISO 8601 local time, e.g. '2026-07-13T07:30:00'. A timezone offset or 'Z' suffix is accepted but ignored by Strava, which records the wall-clock time.",
    ),
  elapsedTimeSeconds: z
    .number()
    .int()
    .positive()
    .describe("Total duration of the activity in seconds."),
  distanceMeters: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "Distance covered in meters. Omit for stationary activities like strength or yoga.",
    ),
  description: z.string().optional().describe("Description text to set."),
  trainer: z
    .boolean()
    .optional()
    .describe("Mark the activity as a trainer/indoor activity."),
  commute: z.boolean().optional().describe("Mark the activity as a commute."),
});

type CreateActivityInput = z.infer<typeof CreateActivityInputSchema>;

export const createActivityTool = {
  name: "create-activity",
  description:
    "Creates a manual activity on the athlete's Strava timeline — for sessions without a device recording, " +
    "e.g. strength training, yoga, or a treadmill run. Takes a title, sport type, local start time, and " +
    "duration, plus optional distance, description, and trainer/commute flags. Requires the activity:write " +
    "scope. Not idempotent: calling it twice creates two activities.",
  inputSchema: CreateActivityInputSchema,
  annotations: WRITE_CREATE,
  execute: async (input: CreateActivityInput) => {
    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Configuration error: Missing Strava access token.",
          },
        ],
        isError: true,
      };
    }

    const params: CreateActivityParams = {
      name: input.name,
      sportType: input.sportType,
      startDateLocal: input.startDateLocal,
      elapsedTimeSeconds: input.elapsedTimeSeconds,
      distanceMeters: input.distanceMeters,
      description: input.description,
      trainer: input.trainer,
      commute: input.commute,
    };

    try {
      const created = await postActivity(token, params);

      const parts = [
        created.sport_type ?? input.sportType,
        formatDuration(input.elapsedTimeSeconds),
      ];
      if (input.distanceMeters !== undefined && input.distanceMeters > 0) {
        parts.push(`${(input.distanceMeters / 1000).toFixed(2)} km`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Created activity ${created.id} ("${created.name}"): ${parts.join(", ")}, ` +
              `starting ${input.startDateLocal}. View it at https://www.strava.com/activities/${created.id}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let hint = "";
      if (message.includes("401") || message.includes("Authorization")) {
        hint =
          " This may mean the activity:write scope is missing; re-authorize the app.";
      } else if (message.includes("409")) {
        hint =
          " Strava rejects manual activities that overlap an existing one; this is likely a duplicate.";
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to create activity "${input.name}": ${message}.${hint}`,
          },
        ],
        isError: true,
      };
    }
  },
};
