import { formatDistance } from "../formatters";
import { getAuthenticatedAthlete } from "../stravaClient";
import { type GearListItem, projectAthleteGear } from "../utils/gear";
import { READ_ONLY } from "./_annotations";

function formatGearLine(g: GearListItem): string {
  const label = g.nickname ? `${g.name} (${g.nickname})` : g.name;
  const flags: string[] = [];
  if (g.primary) flags.push("primary");
  if (g.retired) flags.push("retired");
  const suffix = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `   - ${label} — id ${g.id}, ${formatDistance(g.distanceMeters)}${suffix}`;
}

export const listGearTool = {
  name: "list-gear",
  description:
    "Lists the authenticated athlete's gear (shoes and bikes) with their ids, " +
    "total distance, and primary/retired status. Use the returned id as gearId for update-activity.",
  inputSchema: undefined,
  annotations: READ_ONLY,
  execute: async () => {
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

    try {
      const athlete = await getAuthenticatedAthlete(token);
      const gear = projectAthleteGear(athlete);

      if (gear.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No gear found on your Strava profile.",
            },
          ],
        };
      }

      const shoes = gear.filter((g) => g.type === "shoe");
      const bikes = gear.filter((g) => g.type === "bike");
      const sections: string[] = [];
      if (shoes.length > 0) {
        sections.push(`Shoes:\n${shoes.map(formatGearLine).join("\n")}`);
      }
      if (bikes.length > 0) {
        sections.push(`Bikes:\n${bikes.map(formatGearLine).join("\n")}`);
      }

      return {
        content: [{ type: "text" as const, text: sections.join("\n\n") }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: "text" as const, text: `Failed to list gear: ${message}` },
        ],
        isError: true,
      };
    }
  },
};
