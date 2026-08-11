import { RateLimitError } from "../fetchClient";

/**
 * The rate-limit error a `stravaClient` call actually throws.
 *
 * Every client function funnels its failures through `handleApiError`, which
 * rethrows a 429 with the context prefixed onto the message. A tool test that
 * rejects with a raw `RateLimitError` straight off the fetch layer is mocking a
 * shape production cannot produce — which is how the scan tools' rate-limit
 * abort passed its tests while being dead in the server (the client used to
 * flatten the error into a plain `Error`, so `instanceof RateLimitError` was
 * never true). Building it here keeps the three scan tools testing against one
 * definition of that shape; `stravaClient.retry.test.ts` pins the translation
 * itself.
 */
export function handledRateLimit(
  context: string,
  detail = "15-minute rate limit reached (100/100 requests).",
): RateLimitError {
  return new RateLimitError(
    `Strava rate limit exceeded in ${context}. ${detail}`,
    { status: 429, statusText: "Too Many Requests", data: "" },
    { observedAt: Date.now(), shortTerm: { limit: 100, usage: 100 } },
    60,
    detail,
  );
}
