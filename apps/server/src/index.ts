import { randomUUID } from "node:crypto";
import path from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import {
  handleAuthCallback,
  handleAuthStart,
  handleAuthStatus,
} from "./authRoutes";
import { handleHealth } from "./health";
import { unauthorizedMcpResponse, warnIfMcpUnprotected } from "./mcpAuth";
import { createServer } from "./server";
import { ensureValidToken } from "./tokenManager";

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

// --- Server Startup ---

console.error("Starting Strava MCP Server...");
warnIfMcpUnprotected();
console.error("Checking Strava token validity...");
await ensureValidToken();
console.error("Token validation complete.");

const httpServer = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/mcp") {
      const denied = unauthorizedMcpResponse(req);
      if (denied) return denied;
      return handleMcp(req);
    }

    if (url.pathname === "/health") {
      return handleHealth(req, url);
    }

    if (url.pathname === "/auth/start") {
      return handleAuthStart(req, url);
    }

    if (url.pathname === "/auth/callback") {
      return handleAuthCallback(url);
    }

    if (url.pathname === "/auth/status") {
      return handleAuthStatus(req, url);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.error(`Listening on http://${HOST}:${PORT}`);
console.error(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
console.error(`Health check: http://${HOST}:${PORT}/health`);

// Graceful shutdown. SIGINT covers Ctrl-C; SIGTERM is what `docker stop` and
// orchestrators send — without a handler the container is hard-killed after
// the grace period with transports left open.
async function shutdown(signal: string): Promise<void> {
  console.error(`Received ${signal}, shutting down...`);
  // Stop accepting new connections while draining existing sessions.
  httpServer.stop();
  for (const [id, transport] of transports) {
    console.error(`Closing session ${id}`);
    await transport.close();
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
