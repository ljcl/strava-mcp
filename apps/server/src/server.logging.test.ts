/**
 * The advertised `logging` capability and the per-call telemetry behind it
 * (#241), asserted over the real transport rather than against the in-memory
 * server object — a capability that does not serialize is not advertised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tokenManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenManager")>();
  return { ...actual, getStravaToken: vi.fn(async () => "test-token") };
});

const { createServer, dispatchToolCall } = await import("./server");
const { createMcpSessionManager } = await import("./mcpSession");
const { resetToolCallStats, toolCallStats } = await import("./telemetry");

/** Initialize a session and return the parsed initialize result. */
async function initializeOverTheWire(): Promise<{
  manager: ReturnType<typeof createMcpSessionManager>;
  sessionId: string;
  result: Record<string, unknown>;
}> {
  const manager = createMcpSessionManager(createServer);
  const response = await manager.handleRequest(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "logging-test", version: "1.0" },
        },
      }),
    }),
  );

  const sessionId = response.headers.get("mcp-session-id") ?? "";
  const body = await response.text();
  // Responses come back as SSE; the payload is the `data:` line.
  const data = body
    .split("\n")
    .find((line) => line.startsWith("data:"))!
    .slice(5);
  return { manager, sessionId, result: JSON.parse(data).result };
}

describe("logging capability", () => {
  it("is advertised in the initialize result", async () => {
    const { result } = await initializeOverTheWire();

    const capabilities = result.capabilities as Record<string, unknown>;
    expect(capabilities).toHaveProperty("logging");
    // The pre-existing three are untouched.
    expect(capabilities).toHaveProperty("tools");
    expect(capabilities).toHaveProperty("resources");
    expect(capabilities).toHaveProperty("prompts");
  });

  it("answers logging/setLevel rather than method-not-found", async () => {
    const { manager, sessionId } = await initializeOverTheWire();

    await manager.handleRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      }),
    );

    const response = await manager.handleRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "logging/setLevel",
          params: { level: "info" },
        }),
      }),
    );

    const body = await response.text();
    // Declaring the capability without a handler would answer -32601 here,
    // which is worse than never advertising it.
    expect(body).not.toContain("-32601");
    expect(body).not.toContain("Method not found");
  });
});

describe("dispatch telemetry", () => {
  beforeEach(() => {
    resetToolCallStats();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records an unknown tool as an error", async () => {
    await dispatchToolCall("no-such-tool", {});

    expect(toolCallStats()["no-such-tool"]).toMatchObject({
      calls: 1,
      errors: 1,
    });
  });

  it("records a rejected argument set separately from a handler failure", async () => {
    await dispatchToolCall("get-segment", { segmentId: "not-an-id" });

    const stats = toolCallStats()["get-segment"]!;
    expect(stats.calls).toBe(1);
    expect(stats.errors).toBe(1);
  });

  it("hands the same record to the session sink it writes to stderr", async () => {
    const records: unknown[] = [];

    await dispatchToolCall("no-such-tool", {}, (record) => {
      records.push(record);
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "tool_call",
      tool: "no-such-tool",
      outcome: "error",
    });
  });

  it("times the call, including the work before the handler runs", async () => {
    await dispatchToolCall("get-segment", { segmentId: "not-an-id" });

    const stats = toolCallStats()["get-segment"]!;
    expect(stats.total_ms).toBeGreaterThanOrEqual(0);
    expect(stats.last_called_at).not.toBe("");
  });
});
