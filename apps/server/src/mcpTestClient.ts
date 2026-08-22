/**
 * One MCP client per protocol era for the tests that assert what a host
 * actually receives.
 *
 * Several suites need the same thing: a real exchange through
 * `createMcpEndpoint(createServer)`, driven over the transport rather than
 * against the in-memory server object. That distinction is the whole point —
 * an annotation, capability, or schema that does not serialize cannot
 * influence a host, and a table in memory proves nothing about the wire.
 *
 * The endpoint serves two eras (dual era until clients finish migrating), so
 * the client speaks both:
 *
 * - `"legacy"` (2025-06-18 family): the `initialize` handshake, then plain
 *   JSON-RPC POSTs answered on an SSE stream. The 2026-07-28 endpoint serves
 *   this era statelessly, so there is no `Mcp-Session-Id` any more — each
 *   request stands alone, which the 2025 spec always allowed.
 * - `"modern"` (2026-07-28): no handshake at all; every request carries the
 *   `io.modelcontextprotocol/*` envelope keys in `params._meta` plus the
 *   `Mcp-Method` header, and capabilities come from `server/discover`.
 *
 * Every protocol-surface suite drives the endpoint through this client, so a
 * protocol change is fixed once, here — never by re-bootstrapping in a new
 * suite.
 */

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { createMcpEndpoint } from "./mcpEndpoint";
import { createServer } from "./server";

export type ProtocolEra = "legacy" | "modern";

/** The 2026-07-28 revision every modern-era request names in its envelope. */
export const MODERN_PROTOCOL_VERSION = "2026-07-28";

/** The 2025-era revision the legacy handshake negotiates. */
export const LEGACY_PROTOCOL_VERSION = "2025-06-18";

/** A JSON-RPC response as it came off the wire. */
export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface McpTestClient {
  era: ProtocolEra;
  /**
   * The era's handshake result: the `initialize` result on legacy (with
   * `capabilities`, `serverInfo`, `protocolVersion`), the `server/discover`
   * result on modern (with `capabilities`, `supportedVersions`).
   */
  handshake: Record<string, unknown>;
  /** Send a request and return the parsed JSON-RPC response. */
  send(method: string, params?: unknown): Promise<JsonRpcResponse>;
  /** Send a request and return the raw body, for asserting on notifications. */
  sendRaw(method: string, params?: unknown): Promise<string>;
  /** Abort anything in flight; the endpoint holds no sessions to drain. */
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
 * Every JSON payload in a response body. A modern exchange answers with a
 * bare JSON document unless the handler emitted notifications first (progress
 * upgrades it to SSE); a legacy exchange always answers on an SSE stream. So
 * the parser accepts both shapes and returns each `data:` line (or the one
 * document) in order.
 */
export function parseBodyPayloads(raw: string): JsonRpcResponse[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return [JSON.parse(trimmed) as JsonRpcResponse];
  }
  return trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length)) as JsonRpcResponse);
}

/**
 * The JSON-RPC *response* in a body that may also carry notifications —
 * a progress line arriving before the result must not be mistaken for it.
 */
export function parseResponse(raw: string): JsonRpcResponse | null {
  return (
    parseBodyPayloads(raw).find(
      (payload) =>
        payload.id !== undefined &&
        (payload.result !== undefined || payload.error !== undefined),
    ) ?? null
  );
}

/** The reserved envelope keys a 2026-07-28 request carries in `params._meta`. */
function modernEnvelope(clientName: string): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: clientName, version: "1.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
}

/** Complete the era's bootstrap and return a client bound to the endpoint. */
export async function connectTestClient(
  clientName = "integration-test",
  era: ProtocolEra = "legacy",
): Promise<McpTestClient> {
  const endpoint = createMcpEndpoint(createServer);
  let nextId = 2;

  const sendRaw = async (method: string, params: unknown = {}) => {
    const id = nextId++;
    let body: Record<string, unknown>;
    let headers: Record<string, string> = {};
    if (era === "modern") {
      const merged = params as Record<string, unknown>;
      body = {
        jsonrpc: "2.0",
        id,
        method,
        params: {
          ...merged,
          // Caller-supplied keys win, so a test can override an envelope
          // claim (e.g. name an unsupported revision on purpose).
          _meta: {
            ...modernEnvelope(clientName),
            ...(merged._meta as Record<string, unknown> | undefined),
          },
        },
      };
      headers = { "Mcp-Method": method };
      // SEP-2243: when the body names a tool, prompt, or resource uri, the
      // Mcp-Name header must carry the same value — the modern path rejects
      // a mismatch or an absence with -32020.
      const name = merged.name ?? merged.uri;
      if (typeof name === "string") headers["Mcp-Name"] = name;
    } else {
      body = { jsonrpc: "2.0", id, method, params };
    }
    const response = await endpoint.handleRequest(post(body, headers));
    return await response.text();
  };

  const send = async (method: string, params: unknown = {}) => {
    const raw = await sendRaw(method, params);
    const parsed = parseResponse(raw);
    if (!parsed) throw new Error(`no JSON-RPC response in ${method}: ${raw}`);
    return parsed;
  };

  let handshake: Record<string, unknown>;
  if (era === "modern") {
    // Modern needs no handshake; `server/discover` is the optional probe that
    // replaces initialize's advertisement.
    handshake = (await send("server/discover")).result ?? {};
  } else {
    const init = await endpoint.handleRequest(
      post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LEGACY_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: clientName, version: "1.0" },
        },
      }),
    );
    handshake = parseResponse(await init.text())?.result ?? {};
    await endpoint.handleRequest(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
  }

  return {
    era,
    handshake,
    send,
    sendRaw,
    close: () => endpoint.close(),
  };
}
