import { z } from "zod";
import {
  computeGradientProfile,
  GradientProfileError,
} from "../gradientProfile";
import { loadRouteProfile } from "../routeProfile";
import { getRouteById } from "../stravaClient";
import { READ_ONLY } from "./_annotations";
import { stravaIdInput } from "./_ids";
import { describeProfile, profileTextLines } from "./_profileText";
import {
  RoutePreviewOutputSchema,
  toGradientProfileOutput,
  warnOnSchemaDrift,
} from "./outputs";

const name = "get-route-preview";

const description = `
Previews a saved route's climbs before you ride or run it, from the route's stored elevation profile.

list-athlete-routes and get-route report a route's total distance and elevation
gain, which says nothing about where the hard parts are. This tool names every
sustained climb on the course and reports:
- Each climb's position along the route, length, average grade, and gain
- The crux: the steepest sustained ~200 m stretch and how far in it sits
- A gradient band breakdown along the whole course
- A shape verdict — steady, front-loaded, back-loaded, rolling, or flat

Use Cases:
- "Where are the climbs on this route, and how bad is the one at 14 km?"
- Plan fueling and pacing before a race on a course you have saved
- Decide which of two saved routes is the harder day

Parameters:
- routeId (required): The Strava route to preview

Notes:
- Pair with view-route-map to see the same profile on the map
- Routes saved before Strava stored profiles fall back to their GPX elevation
`;

const inputSchema = z.object({
  routeId: stravaIdInput("The Strava route to preview."),
});

type GetRoutePreviewInput = z.infer<typeof inputSchema>;

export const getRoutePreviewTool = {
  name,
  description,
  inputSchema,
  annotations: READ_ONLY,
  outputSchema: RoutePreviewOutputSchema,
  execute: async ({ routeId }: GetRoutePreviewInput, token: string) => {
    try {
      const [route, elevation] = await Promise.all([
        getRouteById(token, routeId),
        loadRouteProfile(token, routeId),
      ]);

      if (!elevation) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ "${route.name}" has no stored elevation profile and its GPX export carries no elevation, so its climbs cannot be previewed. get-route still reports its distance and total elevation gain.`,
            },
          ],
          isError: true,
        };
      }

      const profile = computeGradientProfile({
        distance: elevation.distance,
        altitude: elevation.altitude,
      });

      const warnings = [...profile.warnings];
      if (elevation.source === "gpx") {
        warnings.push(
          "This route has no stored elevation stream; the profile was read from its GPX export.",
        );
      }

      const structured = {
        route_id: String(route.id),
        name: route.name,
        type: route.type === 2 ? "Run" : "Ride",
        distance_m: route.distance,
        elevation_gain_m: route.elevation_gain ?? 0,
        elevation_source: elevation.source,
        profile: toGradientProfileOutput(profile),
        warnings,
      };
      warnOnSchemaDrift(name, RoutePreviewOutputSchema, structured);

      const header = [
        `Route Preview: ${route.name} (ID: ${route.id})`,
        [
          `${(route.distance / 1000).toFixed(1)} km ${structured.type}`,
          `+${Math.round(structured.elevation_gain_m)} m total gain`,
          `${profile.climbs.length} sustained climb${profile.climbs.length === 1 ? "" : "s"}`,
        ].join(", "),
        "",
        describeProfile(profile, "route"),
        "",
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: [
              ...header,
              ...profileTextLines({ ...profile, warnings }),
            ].join("\n"),
          },
        ],
        structuredContent: structured,
      };
    } catch (error) {
      if (error instanceof GradientProfileError) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error.message}` }],
          isError: true,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error in ${name}:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to preview route ${routeId}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
