import { type RouteMapSource } from "./types";

export interface RouteMapContextInput {
  name: string | null;
  source: RouteMapSource;
  activityType: string | null;
  distanceKm: number;
  elevationGain: number;
  hasGeometry: boolean;
  /** Label of the metric the track is colored by, when streams are present. */
  colorMetric?: string | null;
}

/**
 * One-line summary of what the map shows, reported to the host's model context
 * so the assistant can reference the view without re-fetching.
 */
export function buildRouteMapContextSummary(
  input: RouteMapContextInput,
): string | null {
  const {
    name,
    source,
    activityType,
    distanceKm,
    elevationGain,
    hasGeometry,
    colorMetric,
  } = input;
  if (!name) return null;

  const label = source === "route" ? "route" : "activity";
  const kind = activityType ? `${activityType} ${label}` : label;
  const parts = [`Viewing the map for ${kind} "${name}".`];

  if (hasGeometry) {
    parts.push(`Distance ${distanceKm.toFixed(1)} km.`);
    if (elevationGain > 0) {
      parts.push(`Elevation gain ${Math.round(elevationGain)} m.`);
    }
    if (colorMetric) {
      parts.push(`The track is coloured by ${colorMetric.toLowerCase()}.`);
    }
  } else {
    parts.push("No GPS track is available for it.");
  }

  return parts.join(" ");
}
