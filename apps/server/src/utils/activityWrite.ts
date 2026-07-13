export type DescriptionMode = "append" | "replace";

export interface UpdateActivityParams {
  name?: string;
  description?: string;
  sportType?: string;
  gearId?: string;
  commute?: boolean;
  trainer?: boolean;
  hideFromHome?: boolean;
}

/**
 * Resolves the final description string to send to Strava.
 * Append preserves any existing description, separated by a blank line.
 */
export function composeDescription(
  existing: string | null | undefined,
  incoming: string,
  mode: DescriptionMode,
): string {
  if (mode === "replace") {
    return incoming;
  }
  if (!existing || existing.trim() === "") {
    return incoming;
  }
  return `${existing}\n\n${incoming}`;
}

export interface CreateActivityParams {
  name: string;
  sportType: string;
  startDateLocal: string;
  elapsedTimeSeconds: number;
  distanceMeters?: number;
  description?: string;
  trainer?: boolean;
  commute?: boolean;
}

/**
 * Builds the POST /activities body for a manual activity, including only
 * provided fields and mapping camelCase params to Strava's snake_case keys.
 * `trainer`/`commute` are sent as 1/0 — the endpoint documents them as
 * integers, unlike the PUT which takes booleans.
 */
export function buildCreateActivityBody(
  params: CreateActivityParams,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: params.name,
    sport_type: params.sportType,
    start_date_local: params.startDateLocal,
    elapsed_time: params.elapsedTimeSeconds,
  };
  if (params.distanceMeters !== undefined)
    body.distance = params.distanceMeters;
  if (params.description !== undefined) body.description = params.description;
  if (params.trainer !== undefined) body.trainer = params.trainer ? 1 : 0;
  if (params.commute !== undefined) body.commute = params.commute ? 1 : 0;
  return body;
}

/**
 * Builds the UpdatableActivity PUT body, including only provided fields
 * and mapping camelCase params to Strava's snake_case keys.
 */
export function buildUpdateActivityBody(
  updates: UpdateActivityParams,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.sportType !== undefined) body.sport_type = updates.sportType;
  if (updates.gearId !== undefined) body.gear_id = updates.gearId;
  if (updates.commute !== undefined) body.commute = updates.commute;
  if (updates.trainer !== undefined) body.trainer = updates.trainer;
  if (updates.hideFromHome !== undefined)
    body.hide_from_home = updates.hideFromHome;
  return body;
}
