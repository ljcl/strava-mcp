/**
 * Session-lifecycle tests for the /mcp HTTP entrypoint (#115): initialize
 * creates a session, follow-up requests route by mcp-session-id, malformed
 * JSON returns a JSON-RPC parse error instead of throwing out of req.json(),
 * and shutdown drains every open transport.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { describe, expect, it } from "vitest";
import { createMcpSessionManager, type McpSessionManager } from "./mcpSession";

const MCP_URL = "http://localhost/mcp";

/** Minimal MCP server; the session layer never dispatches Strava tools. */
function makeManager(): McpSessionManager {
  return createMcpSessionManager(
    () => new Server({ name: "test", version: "0.0.0" }, { capabilities: {} }),
  );
}

function post(
  body: string | Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const INITIALIZE_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  },
} as const;

/** Run initialize and return the session id the transport assigned. */
async function initializeSession(manager: McpSessionManager): Promise<string> {
  const response = await manager.handleRequest(post(INITIALIZE_BODY));
  expect(response.status).toBe(200);
  const sessionId = response.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  await response.body?.cancel();
  return sessionId as string;
}

describe("createMcpSessionManager", () => {
  it("creates a session on an initialize POST and tracks it", async () => {
    const manager = makeManager();

    const sessionId = await initializeSession(manager);

    expect(sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(manager.sessionCount()).toBe(1);
  });

  it("routes follow-up POSTs to the session transport", async () => {
    const manager = makeManager();
    const sessionId = await initializeSession(manager);

    const response = await manager.handleRequest(
      post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { "mcp-session-id": sessionId },
      ),
    );

    // Notifications are accepted with 202 by the transport — proof the
    // request reached the session rather than the no-session branch.
    expect(response.status).toBe(202);
  });

  it("returns 404 for a POST with an unknown session id", async () => {
    const manager = makeManager();
    await initializeSession(manager);

    const response = await manager.handleRequest(
      post(
        { jsonrpc: "2.0", id: 2, method: "ping" },
        { "mcp-session-id": "not-a-real-session" },
      ),
    );

    expect(response.status).toBe(404);
  });

  it("returns a JSON-RPC parse error (-32700) for malformed JSON", async () => {
    const manager = makeManager();

    const response = await manager.handleRequest(post("{not json"));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  it("parse errors do not create sessions", async () => {
    const manager = makeManager();

    await manager.handleRequest(post("[[["));

    expect(manager.sessionCount()).toBe(0);
  });

  it("rejects a sessionless non-initialize POST with -32000", async () => {
    const manager = makeManager();

    const response = await manager.handleRequest(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe(-32000);
    expect(manager.sessionCount()).toBe(0);
  });

  it("returns 400 for GET and DELETE without a session id", async () => {
    const manager = makeManager();

    for (const method of ["GET", "DELETE"]) {
      const response = await manager.handleRequest(
        new Request(MCP_URL, { method }),
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Invalid or missing session ID");
    }
  });

  it("returns 405 for unsupported methods", async () => {
    const manager = makeManager();

    const response = await manager.handleRequest(
      new Request(MCP_URL, { method: "PUT" }),
    );

    expect(response.status).toBe(405);
  });

  it("removes the session when the client DELETEs it", async () => {
    const manager = makeManager();
    const sessionId = await initializeSession(manager);
    expect(manager.sessionCount()).toBe(1);

    const response = await manager.handleRequest(
      new Request(MCP_URL, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId },
      }),
    );

    expect(response.status).toBe(200);
    expect(manager.sessionCount()).toBe(0);
  });

  it("keeps sessions independent — closing one leaves the other", async () => {
    const manager = makeManager();
    const first = await initializeSession(manager);
    const second = await initializeSession(manager);
    expect(manager.sessionCount()).toBe(2);

    await manager.handleRequest(
      new Request(MCP_URL, {
        method: "DELETE",
        headers: { "mcp-session-id": first },
      }),
    );

    expect(manager.sessionCount()).toBe(1);
    const response = await manager.handleRequest(
      post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { "mcp-session-id": second },
      ),
    );
    expect(response.status).toBe(202);
  });

  it("closeAllSessions drains every open transport (shutdown path)", async () => {
    const manager = makeManager();
    await initializeSession(manager);
    await initializeSession(manager);
    expect(manager.sessionCount()).toBe(2);

    await manager.closeAllSessions();

    expect(manager.sessionCount()).toBe(0);
  });
});
