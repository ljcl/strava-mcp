import { z } from "zod";
import { formatRouteSummary } from "../formatters"; // Import shared formatter
import { getRouteById } from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { toolErrorText } from "./_errors";
import { stravaIdInput } from "./_ids";
import {
  RouteOutputSchema,
  toRouteSummary,
  warnOnSchemaDrift,
} from "./outputs";

// Zod schema for input validation
const GetRouteInputSchema = z.object({
  routeId: stravaIdInput("The unique identifier of the route to fetch."),
});

type GetRouteInput = z.infer<typeof GetRouteInputSchema>;

// Tool definition
export const getRouteTool = {
  name: "get-route",
  description:
    "Fetch full detail for one saved route by id: name, distance, elevation gain, estimated moving time, and segment count. Use when the user wants details of a route from list-athlete-routes, or before exporting it with export-route-gpx or export-route-tcx.",
  inputSchema: GetRouteInputSchema,
  annotations: READ_ONLY,
  outputSchema: RouteOutputSchema,
  execute: async (input: GetRouteInput, token: string) => {
    const { routeId } = input;
    try {
      console.error(`Fetching route details for ID: ${routeId}...`);
      const route = await getRouteById(token, routeId);
      const summary = formatRouteSummary(route); // Call shared formatter without units

      console.error(`Successfully fetched route ${routeId}.`);
      const structured = {
        ...toRouteSummary(route),
        description: route.description ?? null,
      };
      warnOnSchemaDrift("get-route", RouteOutputSchema, structured);

      return {
        content: [{ type: "text" as const, text: summary }],
        structuredContent: structured,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: toolErrorText(error, {
              context: `fetch route ${routeId}`,
              notFound: `Route with ID ${routeId} not found.`,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
