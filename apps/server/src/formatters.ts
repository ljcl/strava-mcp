import { type StravaRoute } from "./stravaClient";

/**
 * Format duration in seconds to HH:MM:SS or MM:SS string.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (
    seconds === null ||
    seconds === undefined ||
    Number.isNaN(seconds) ||
    seconds < 0
  ) {
    return "N/A";
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format duration in seconds to human-readable string (e.g., "1h 30m").
 */
export function formatDurationHuman(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format distance in meters to km string.
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "N/A";
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Format elevation in meters to rounded integer string.
 */
export function formatElevation(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "N/A";
  return `${Math.round(meters)} m`;
}

/**
 * Format speed in m/s to km/h string.
 */
export function formatSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined) return "N/A";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

/**
 * Formats a Strava route object into a concise summary string.
 */
export function formatRouteSummary(route: StravaRoute): string {
  const distanceKm = formatDistance(route.distance);
  const elevation = formatElevation(route.elevation_gain);
  const date = new Date(route.created_at).toLocaleDateString();
  const type = route.type === 1 ? "Ride" : route.type === 2 ? "Run" : "Walk";

  let summary = `📍 Route: ${route.name} (#${route.id})\n`;
  summary += `   - Type: ${type}, Distance: ${distanceKm}, Elevation: ${elevation}\n`;
  summary += `   - Created: ${date}, Segments: ${route.segments?.length ?? "N/A"}\n`;
  if (route.description) {
    summary += `   - Description: ${route.description.substring(0, 100)}${route.description.length > 100 ? "..." : ""}\n`;
  }
  return summary;
}
