import { z } from "zod";

/**
 * Tool-input schema for a Strava resource id (activity, segment, effort,
 * athlete, route).
 *
 * Strava ids are 64-bit and both segment-effort and newer route ids already
 * exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1). An id sent as a JSON number can
 * lose precision in the host's JSON round-trip before validation ever sees it,
 * so the digit-string form is the only lossless representation. The schema is
 * therefore string-only: advertising an integer branch would invite a host or
 * model to send the bare number, which `JSON.parse` silently rounds (e.g.
 * `3512771082082480078` -> `3512771082082480000`) before zod runs. Ids are
 * opaque identifiers, never used numerically, so nothing is lost by requiring
 * the string form. The fetch layer reports ids as exact strings (see
 * `parseJsonWithLargeInts`), so string ids round-trip cleanly.
 */
export const stravaIdInput = (description: string) =>
  z
    .string()
    .regex(/^\d+$/, "id must be a string of digits")
    .describe(
      `${description} Pass the id as a string of digits: ids above 2^53 lose precision as JSON numbers.`,
    );
