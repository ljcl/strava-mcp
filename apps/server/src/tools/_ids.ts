import { z } from "zod";

/**
 * Tool-input schema for a Strava resource id (activity, segment, effort,
 * athlete, route).
 *
 * Strava ids are 64-bit and both segment-effort and newer route ids already
 * exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1). An id sent as a JSON number can
 * lose precision in the host's JSON round-trip before validation ever sees it,
 * so the digit-string form is the only lossless representation for those.
 *
 * The schema therefore accepts either form and normalises to a string:
 *
 * - A digit string is always accepted and passes through unchanged — this is
 *   the lossless form and the one to prefer for large ids.
 * - A bare number is accepted only when it is a non-negative *safe* integer,
 *   in which case it is coerced to its digit string. Route and activity ids sit
 *   well below 2^53, so this is exactly the everyday case where a host or model
 *   naturally emits `route_id: 12345`; rejecting it outright (the previous
 *   string-only behaviour) left callers stuck between "expected string,
 *   received number" and quoting the digits into a non-digit string.
 * - A number that is not a safe integer is rejected with a message telling the
 *   caller to pass the id as a string. By the time such a value reaches zod it
 *   has already been rounded by the host's `JSON.parse` (e.g.
 *   `3512771082082480078` -> `3512771082082480000`), so accepting it would
 *   silently corrupt the id — better to fail loudly and steer to the string.
 *
 * Ids are opaque identifiers, never used numerically, so coercing a safe
 * integer to its string loses nothing. The fetch layer reports ids as exact
 * strings (see `parseJsonWithLargeInts`), so string ids round-trip cleanly.
 */
export const stravaIdInput = (description: string) =>
  z
    .union([
      z.string().regex(/^\d+$/, "id must be a string of digits"),
      z
        .number()
        .int("id must be a whole number")
        .nonnegative("id must be non-negative")
        .refine(Number.isSafeInteger, {
          message:
            "id exceeds safe integer precision; pass it as a string of digits",
        }),
    ])
    .transform((value) => String(value))
    .describe(
      `${description} Pass the id as a string of digits (a plain number is also accepted for ids below 2^53); ids above 2^53 must be a string to avoid precision loss.`,
    );
