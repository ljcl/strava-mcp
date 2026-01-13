import { randomUUID } from "node:crypto";
import path from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import { createServer } from "./server";
import {
  ensureValidToken,
  exchangeCodeForTokens,
  getTokenStatus,
} from "./tokenManager";

// Load .env file from monorepo root
dotenv.config({
  path: path.resolve(import.meta.dirname, "..", "..", "..", ".env"),
});

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

// Map of session ID -> transport
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

function createTransport(): WebStandardStreamableHTTPServerTransport {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      console.error(`Session initialized: ${sessionId}`);
      transports.set(sessionId, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) {
      console.error(`Session closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    }
  };
  return transport;
}

async function handleMcp(req: Request): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");

  // GET/DELETE: reuse existing session
  if (req.method === "GET" || req.method === "DELETE") {
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      return new Response("Invalid or missing session ID", { status: 400 });
    }
    return transport.handleRequest(req);
  }

  // POST: reuse or create new session
  if (req.method === "POST") {
    const body = await req.json();

    if (sessionId) {
      const transport = transports.get(sessionId);
      if (!transport) {
        return new Response("Invalid session ID", { status: 404 });
      }
      return transport.handleRequest(req, { parsedBody: body });
    }

    // New session — must be initialize request
    if (isInitializeRequest(body)) {
      const transport = createTransport();
      const server = createServer();
      await server.connect(transport);
      return transport.handleRequest(req, { parsedBody: body });
    }

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("Method not allowed", { status: 405 });
}

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

// --- OAuth Route Handlers ---

function handleAuthStart(): Response {
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
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&approval_prompt=force&scope=${scopes}`;

  return Response.redirect(authUrl, 302);
}

async function handleAuthCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(errorPage(`Authorization denied: ${error}`), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

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

async function handleAuthStatus(): Promise<Response> {
  const status = await getTokenStatus();
  return new Response(JSON.stringify(status), {
    headers: { "Content-Type": "application/json" },
  });
}

// --- Server Startup ---

console.error("Starting Strava MCP Server...");
console.error("Checking Strava token validity...");
await ensureValidToken();
console.error("Token validation complete.");

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/mcp") {
      return handleMcp(req);
    }

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/auth/start") {
      return handleAuthStart();
    }

    if (url.pathname === "/auth/callback") {
      return handleAuthCallback(url);
    }

    if (url.pathname === "/auth/status") {
      return handleAuthStatus();
    }

    return new Response("Not found", { status: 404 });
  },
});

console.error(`Listening on http://${HOST}:${PORT}`);
console.error(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
console.error(`Health check: http://${HOST}:${PORT}/health`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down...");
  for (const [id, transport] of transports) {
    console.error(`Closing session ${id}`);
    await transport.close();
  }
  process.exit(0);
});
