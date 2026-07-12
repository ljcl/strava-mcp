import { authTokenConfigured, requestHasValidSecret } from "./mcpAuth";
import { consumeOAuthState, createOAuthState } from "./oauthState";
import { exchangeCodeForTokens, getTokenStatus } from "./tokenManager";

/**
 * OAuth web-flow routes (#109), extracted from index.ts so they are unit
 * testable. Hardening on top of the plain flow:
 *
 * - /auth/start mints a single-use `state` nonce; /auth/callback refuses to
 *   exchange any code that does not present a known state, so a CSRF-ed
 *   callback cannot overwrite the owner's stored tokens with an attacker's
 *   account binding.
 * - When MCP_AUTH_TOKEN is set, /auth/start and /auth/status require the
 *   secret (Authorization header, or ?token= for the browser). The callback
 *   stays open — Strava redirects there without credentials — and is
 *   protected by the state check instead.
 */

// --- HTML Page Helpers ---

function successPage(athleteId?: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Strava Authorization Success</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    .success { color: #16a34a; font-size: 48px; }
    h1 { color: #1f2937; }
    p { color: #4b5563; line-height: 1.6; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    .next-steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-top: 20px; text-align: left; }
  </style>
</head>
<body>
  <div class="success">&#10003;</div>
  <h1>Authorization Successful</h1>
  <p>Your Strava account${
    athleteId ? ` (Athlete ID: <code>${athleteId}</code>)` : ""
  } has been connected.</p>
  <p>Tokens have been saved and will refresh automatically.</p>
  <div class="next-steps">
    <strong>Next Steps:</strong>
    <ol>
      <li>Configure Claude Desktop to use this MCP server</li>
      <li>Start asking questions about your Strava data!</li>
    </ol>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Strava Authorization Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    .error { color: #dc2626; font-size: 48px; }
    h1 { color: #1f2937; }
    p { color: #4b5563; line-height: 1.6; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-top: 20px; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="error">&#10007;</div>
  <h1>Authorization Failed</h1>
  <div class="error-box">
    <p>${message}</p>
  </div>
  <p><a href="/auth/start">Try again</a></p>
</body>
</html>`;
}

function unauthorizedPage(): Response {
  return new Response(
    errorPage(
      "Unauthorized: this server requires its auth secret. Open " +
        "<code>/auth/start?token=&lt;MCP_AUTH_TOKEN&gt;</code> or send an " +
        "<code>Authorization: Bearer</code> header.",
    ),
    { status: 401, headers: { "Content-Type": "text/html" } },
  );
}

// --- OAuth Route Handlers ---

export function handleAuthStart(req: Request, url: URL): Response {
  if (authTokenConfigured() && !requestHasValidSecret(req, url)) {
    return unauthorizedPage();
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const publicUrl = process.env.PUBLIC_URL;

  if (!clientId) {
    return new Response(
      errorPage("Missing STRAVA_CLIENT_ID environment variable"),
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }

  if (!publicUrl) {
    return new Response(errorPage("Missing PUBLIC_URL environment variable"), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  const redirectUri = `${publicUrl}/auth/callback`;
  const scopes =
    "profile:read_all,activity:read,activity:read_all,profile:write,read_all,activity:write";
  const state = createOAuthState();
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&approval_prompt=force&scope=${scopes}&state=${state}`;

  return Response.redirect(authUrl, 302);
}

export async function handleAuthCallback(url: URL): Promise<Response> {
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(errorPage(`Authorization denied: ${error}`), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Validate state BEFORE looking at the code: a callback that did not
  // originate from this server's /auth/start must never reach the exchange.
  if (!consumeOAuthState(url.searchParams.get("state"))) {
    return new Response(
      errorPage(
        "Invalid or expired authorization state. Restart the flow from /auth/start.",
      ),
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response(errorPage("Missing authorization code"), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    return new Response(successPage(tokens.athlete_id), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    return new Response(
      errorPage(err instanceof Error ? err.message : "Token exchange failed"),
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }
}

export async function handleAuthStatus(
  req: Request,
  url: URL,
): Promise<Response> {
  // Token status discloses athlete_id and expiry; do not serve it to the
  // open internet when a secret is configured.
  if (authTokenConfigured() && !requestHasValidSecret(req, url)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = await getTokenStatus();
  return new Response(JSON.stringify(status), {
    headers: { "Content-Type": "application/json" },
  });
}
