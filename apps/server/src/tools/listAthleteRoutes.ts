import { z } from "zod";
import {
  listAthleteRoutes as fetchAthleteRoutes,
  type StravaRoute,
  // StravaRoute is needed for the formatter
} from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import {
  RoutesOutputSchema,
  toRouteSummary,
  warnOnSchemaDrift,
} from "./outputs";

// Define input schema with zod
const ListAthleteRoutesInputSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("Page number for pagination"),
  perPage: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("Number of routes per page (max 50)"),
});

// Export the type for use in the execute function
type ListAthleteRoutesInput = z.infer<typeof ListAthleteRoutesInputSchema>;

// Function to format a route for display
function formatRouteSummary(route: StravaRoute): string {
  const distance = route.distance
    ? `${(route.distance / 1000).toFixed(1)} km`
    : "N/A";
  const elevation = route.elevation_gain
    ? `${route.elevation_gain.toFixed(0)} m`
    : "N/A";

  return `🗺️ **${route.name}** (ID: ${route.id})
   - Distance: ${distance}
   - Elevation: ${elevation}
   - Created: ${new Date(route.created_at).toLocaleDateString()}
   - Type: ${route.type === 1 ? "Ride" : route.type === 2 ? "Run" : "Other"}`;
}

// Tool definition
export const listAthleteRoutesTool = {
  name: "list-athlete-routes",
  description:
    "Lists the routes created by the authenticated athlete, with pagination.",
  inputSchema: ListAthleteRoutesInputSchema,
  annotations: READ_ONLY,
  outputSchema: RoutesOutputSchema,
  execute: async (
    { page = 1, perPage = 20 }: ListAthleteRoutesInput,
    token: string,
  ) => {
    try {
      console.error(`Fetching routes (page ${page}, per_page: ${perPage})...`);

      const routes = await fetchAthleteRoutes(token, page, perPage);

      if (!routes || routes.length === 0) {
        console.error("No routes found for athlete.");
        const empty = { routes: [], count: 0, page, has_more: false };
        warnOnSchemaDrift("list-athlete-routes", RoutesOutputSchema, empty);
        return {
          content: [
            { type: "text" as const, text: "No routes found for the athlete." },
          ],
          structuredContent: empty,
        };
      }

      console.error(`Successfully fetched ${routes.length} routes.`);
      const summaries = routes.map((route) => formatRouteSummary(route));
      const responseText = `**Athlete Routes (Page ${page}):**\n\n${summaries.join("\n")}`;

      const structured = {
        routes: routes.map(toRouteSummary),
        count: routes.length,
        page,
        has_more: routes.length === perPage,
      };
      warnOnSchemaDrift("list-athlete-routes", RoutesOutputSchema, structured);

      return {
        content: [{ type: "text" as const, text: responseText }],
        structuredContent: structured,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: toolErrorText(error, {
              context: `list athlete routes (page ${page})`,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
