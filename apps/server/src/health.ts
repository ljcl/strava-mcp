import { stravaApi } from "./fetchClient";
import { authTokenConfigured, requestHasValidSecret } from "./mcpAuth";
import { getTokenStatus } from "./tokenManager";
import { SERVER_VERSION } from "./version";

/**
 * Structured /health (#129). Everything here is served from local state —
 * stored tokens and the rate-limit snapshot captured off the most recent
 * Strava response — so the endpoint never spends a Strava request.
 *
 * When MCP_AUTH_TOKEN is configured, unauthenticated callers (for example
 * the Docker HEALTHCHECK) get liveness fields only; auth and rate-limit
 * detail require the secret, matching the /auth/status gating.
 */
export async function handleHealth(req: Request, url: URL): Promise<Response> {
  const liveness = {
    status: "ok",
    version: SERVER_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
  };

  if (authTokenConfigured() && !requestHasValidSecret(req, url)) {
    return Response.json(liveness);
  }

  const tokenStatus = await getTokenStatus();
  return Response.json({
    ...liveness,
    authenticated: tokenStatus.authenticated,
    token_expires_at: tokenStatus.expires_at ?? null,
    rate_limit: stravaApi.getRateLimitSnapshot(),
  });
}
