import { z } from "zod";
import {
  getActivityById as fetchActivityById,
  updateActivity as putActivity,
} from "../stravaClient";
import {
  composeDescription,
  type UpdateActivityParams,
} from "../utils/activityWrite";
import { WRITE_DESTRUCTIVE } from "./_annotations";

const UpdateActivityInputSchema = z.object({
  activityId: z
    .number()
    .int()
    .positive()
    .describe("The unique identifier of the activity to update."),
  name: z.string().optional().describe("New activity title."),
  description: z
    .string()
    .optional()
    .describe("Description text to set or add to the activity."),
  descriptionMode: z
    .enum(["append", "replace"])
    .optional()
    .describe(
      "How to apply `description`. 'append' (default) preserves the existing description and adds the new text below it; 'replace' overwrites it. Use 'append' when adding workout notes, 'replace' when rewriting.",
    ),
  sportType: z
    .string()
    .optional()
    .describe("Strava sport type, e.g. 'Run', 'TrailRun', 'Ride'."),
  gearId: z
    .string()
    .optional()
    .describe("Gear id to assign (from list-gear), e.g. 'g123456'."),
  commute: z.boolean().optional().describe("Mark the activity as a commute."),
  trainer: z
    .boolean()
    .optional()
    .describe("Mark the activity as a trainer/indoor activity."),
  hideFromHome: z
    .boolean()
    .optional()
    .describe("Hide the activity from followers' home feeds."),
});

type UpdateActivityInput = z.infer<typeof UpdateActivityInputSchema>;

export const updateActivityTool = {
  name: "update-activity",
  description:
    "Updates an activity's title, description, sport type, gear, or flags (commute/trainer/hidden). " +
    "Description defaults to append (adds to existing notes); pass descriptionMode 'replace' to overwrite. " +
    "Requires the activity:write scope. Assign gear by passing a gearId from list-gear.",
  inputSchema: UpdateActivityInputSchema,
  annotations: WRITE_DESTRUCTIVE,
  execute: async (input: UpdateActivityInput) => {
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

    const {
      activityId,
      name,
      description,
      descriptionMode,
      sportType,
      gearId,
      commute,
      trainer,
      hideFromHome,
    } = input;

    const hasMutation =
      name !== undefined ||
      description !== undefined ||
      sportType !== undefined ||
      gearId !== undefined ||
      commute !== undefined ||
      trainer !== undefined ||
      hideFromHome !== undefined;

    if (!hasMutation) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Nothing to update: provide at least one of name, description, sportType, gearId, commute, trainer, or hideFromHome.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Resolve the description (append composition needs the current value).
      let resolvedDescription: string | undefined;
      let appliedMode: string | undefined;
      if (description !== undefined) {
        const mode = descriptionMode ?? "append";
        appliedMode = mode;
        if (mode === "append") {
          // Read fresh: appending onto a stale cached description would drop
          // edits made since the cache was populated.
          const current = await fetchActivityById(token, activityId, {
            skipCache: true,
          });
          resolvedDescription = composeDescription(
            current.description,
            description,
            "append",
          );
        } else {
          resolvedDescription = description;
        }
      }

      const updates: UpdateActivityParams = {
        name,
        description: resolvedDescription,
        sportType,
        gearId,
        commute,
        trainer,
        hideFromHome,
      };

      const updated = await putActivity(token, activityId, updates);

      const changed: string[] = [];
      if (name !== undefined) changed.push(`name to "${updated.name}"`);
      if (description !== undefined)
        changed.push(`description (${appliedMode})`);
      if (sportType !== undefined)
        changed.push(`sport type to ${updated.sport_type}`);
      if (gearId !== undefined)
        changed.push(`gear to ${updated.gear?.name ?? gearId}`);
      if (commute !== undefined) changed.push(`commute=${commute}`);
      if (trainer !== undefined) changed.push(`trainer=${trainer}`);
      if (hideFromHome !== undefined)
        changed.push(`hideFromHome=${hideFromHome}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated activity ${activityId} ("${updated.name}"): ${changed.join(", ")}.`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hint =
        message.includes("401") || message.includes("Authorization")
          ? " This may mean the activity:write scope is missing; re-authorize the app."
          : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to update activity ${activityId}: ${message}.${hint}`,
          },
        ],
        isError: true,
      };
    }
  },
};
