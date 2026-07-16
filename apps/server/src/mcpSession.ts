import { randomUUID } from "node:crypto";
import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

/** JSON-RPC error codes used by the raw HTTP layer (before a transport exists). */
const PARSE_ERROR = -32700;
const NO_VALID_SESSION = -32000;

function jsonRpcError(code: number, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

export interface McpSessionManager {
  /** Route one HTTP request on the /mcp endpoint to its session transport. */
  handleRequest(req: Request): Promise<Response>;
  /** Number of live sessions (for tests and diagnostics). */
  sessionCount(): number;
  /** Drain every open session, e.g. on SIGTERM before exit. */
  closeAllSessions(): Promise<void>;
}

/**
 * Owns the session-id → transport map behind the /mcp endpoint. Extracted
 * from index.ts (which starts Bun.serve at import time) so the session
 * lifecycle is unit-testable (#115). Each new session gets its own MCP
 * Server instance from `createServer`.
 */
export function createMcpSessionManager(
  createServer: () => Server,
): McpSessionManager {
  const transports = new Map<
    string,
    WebStandardStreamableHTTPServerTransport
  >();

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

  async function handleRequest(req: Request): Promise<Response> {
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
      // A malformed body must surface as a JSON-RPC parse error, not an
      // unhandled rejection out of req.json() (which returned a bare 500).
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonRpcError(PARSE_ERROR, "Parse error: invalid JSON", 400);
      }

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

      return jsonRpcError(
        NO_VALID_SESSION,
        "Bad Request: No valid session ID",
        400,
      );
    }

    return new Response("Method not allowed", { status: 405 });
  }

  return {
    handleRequest,
    sessionCount: () => transports.size,
    closeAllSessions: async () => {
      for (const [id, transport] of transports) {
        console.error(`Closing session ${id}`);
        await transport.close();
      }
    },
  };
}
