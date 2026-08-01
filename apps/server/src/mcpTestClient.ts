/**
 * One MCP client for the tests that assert what a host actually receives.
 *
 * Several suites need the same thing: a real session through
 * `createMcpSessionManager(createServer)`, driven over the transport rather
 * than against the in-memory server object. That distinction is the whole
 * point — an annotation, capability, or schema that does not serialize cannot
 * influence a host, and a table in memory proves nothing about the wire.
 *
 * The bootstrap (initialize, capture `Mcp-Session-Id` from the *response
 * header*, post `notifications/initialized`, then parse the SSE `data:` line)
 * had been copied into three suites before this existed. It lives here now so
 * a protocol change is fixed once.
 */

import { createMcpSessionManager } from "./mcpSession";
import { createServer } from "./server";

/** A JSON-RPC response as it came off the wire. */
export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface McpTestClient {
  sessionId: string;
  /** The `initialize` result, including the server's advertised capabilities. */
  initializeResult: Record<string, unknown>;
  /** Send a request and return the parsed JSON-RPC response. */
  send(method: string, params?: unknown): Promise<JsonRpcResponse>;
  /** Send a request and return the raw body, for asserting on notifications. */
  sendRaw(method: string, params?: unknown): Promise<string>;
  /** Tear the session down; the manager keeps them alive otherwise. */
  close(): Promise<void>;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Pull the JSON payload out of a streamable-HTTP response. The transport
 * answers on an SSE stream, so the body is `event:`/`data:` lines rather than
 * a bare JSON document.
 */
export function parseSseData(raw: string): JsonRpcResponse | null {
  const line = raw
    .split("\n")
    .find((l) => l.startsWith("data:"))
    ?.slice("data:".length)
    .trim();
  if (!line) return null;
  return JSON.parse(line) as JsonRpcResponse;
}

/** Complete the handshake and return a client bound to the new session. */
export async function connectTestClient(
  clientName = "integration-test",
): Promise<McpTestClient> {
  const manager = createMcpSessionManager(createServer);

  const init = await manager.handleRequest(
    post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: clientName, version: "1.0" },
      },
    }),
  );
  const sessionId = init.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("initialize returned no mcp-session-id header");
  }
  const initBody = await init.text();
  const initializeResult = parseSseData(initBody)?.result ?? {};

  await manager.handleRequest(
    post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "mcp-session-id": sessionId },
    ),
  );

  let nextId = 2;
  const sendRaw = async (method: string, params: unknown = {}) => {
    const response = await manager.handleRequest(
      post(
        { jsonrpc: "2.0", id: nextId++, method, params },
        { "mcp-session-id": sessionId },
      ),
    );
    return await response.text();
  };

  return {
    sessionId,
    initializeResult,
    sendRaw,
    close: () => manager.closeAllSessions(),
    send: async (method, params) => {
      const raw = await sendRaw(method, params);
      const parsed = parseSseData(raw);
      if (!parsed) throw new Error(`no SSE data line in ${method}: ${raw}`);
      return parsed;
    },
  };
}
