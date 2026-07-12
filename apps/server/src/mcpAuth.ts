import { timingSafeEqual } from "node:crypto";

/**
 * Optional bearer-token gate for the /mcp endpoint (#108).
 *
 * The README instructs exposing port 3000 publicly (Tailscale Funnel,
 * Cloudflare Tunnel), and without a shared secret anyone who discovers the
 * URL can read all Strava data and call the write tools. When
 * `MCP_AUTH_TOKEN` is set, /mcp requires `Authorization: Bearer <token>`;
 * when unset, behaviour is unchanged (open), with a startup warning if
 * `PUBLIC_URL` suggests the server is internet-facing.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Returns a 401 Response when the request must be rejected, or null when it
 * may proceed (either the token matches or no token is configured).
 */
export function unauthorizedMcpResponse(req: Request): Response | null {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return null;

  const header = req.headers.get("authorization");
  const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (presented && constantTimeEquals(presented, expected)) return null;

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="mcp"',
      },
    },
  );
}

/**
 * Startup nudge: a configured PUBLIC_URL implies the server is reachable
 * from the internet, where an unauthenticated /mcp exposes the athlete's
 * data and write scope to anyone who finds the URL.
 */
export function warnIfMcpUnprotected(): void {
  if (!process.env.MCP_AUTH_TOKEN && process.env.PUBLIC_URL) {
    console.error(
      "WARNING: PUBLIC_URL is set but MCP_AUTH_TOKEN is not. /mcp is " +
        "unauthenticated — anyone who discovers the URL can read your " +
        "Strava data and modify activities. Set MCP_AUTH_TOKEN and add an " +
        '"Authorization: Bearer <token>" header to your MCP client config.',
    );
  }
}
