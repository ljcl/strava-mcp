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
