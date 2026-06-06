import { type ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Read-only tool that calls the Strava API. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

/** Overwrites user data on Strava (e.g. update-activity). */
export const WRITE_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Mutating but convergent: re-running with the same args yields the same state
 * (toggling a star, writing an export file to a deterministic path). */
export const WRITE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** A view tool that only returns a UI resource reference; the app fetches data
 * later, so it does not itself touch the external API. */
export const VIEW: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
