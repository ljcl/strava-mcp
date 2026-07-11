import { z } from "zod";

/**
 * Tool-input schema for a Strava resource id (activity, segment, effort,
 * athlete).
 *
 * Strava ids are 64-bit and segment-effort ids already exceed
 * `Number.MAX_SAFE_INTEGER`, so an id sent as a JSON number can lose
 * precision in the host's JSON round-trip before validation ever sees it —
 * the digit-string form is the only lossless representation. Numbers stay
 * accepted for compatibility; zod's `int()` safe-integer bound rejects
 * oversized numbers instead of letting a rounded id fetch the wrong
 * resource. The fetch layer reports ids as exact strings (see
 * `parseJsonWithLargeInts`), so string ids round-trip cleanly.
 */
export const stravaIdInput = (description: string) =>
  z
    .union([
      z.string().regex(/^\d+$/, "id must be a string of digits"),
      z.number().int().positive(),
    ])
    .describe(
      `${description} Pass the id as a string of digits (preferred): ids above 2^53 lose precision as JSON numbers.`,
    );
