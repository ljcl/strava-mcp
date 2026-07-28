/**
 * The tool permission contract (#303).
 *
 * Annotations are what a host uses to decide whether a tool lands in the
 * "read-only" bucket the athlete can grant once, or the "write/delete" bucket
 * that re-prompts forever. That makes them user-facing behaviour, not
 * decoration, so this file pins three things a presence check missed:
 * every tool's classification is deliberate, the classification survives
 * serialization into a real `tools/list` response, and nothing opts into an
 * unconditional prompt.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { describe, expect, it } from "vitest";
import { createMcpSessionManager } from "./mcpSession";
import { createServer, TOOLS } from "./server";
import {
  READ_ONLY,
  WRITE_CREATE,
  WRITE_DESTRUCTIVE,
  WRITE_IDEMPOTENT,
} from "./tools/_annotations";

describe("annotation constants", () => {
  it("read-only is honest", () => {
    expect(READ_ONLY.readOnlyHint).toBe(true);
    expect(READ_ONLY.openWorldHint).toBe(true);
  });
  it("read-only states destructiveHint rather than leaning on the default", () => {
    // The spec default is `true`, so an absent field reads as destructive to
    // any host that checks it before readOnlyHint — the whole point of #303.
    expect(READ_ONLY.destructiveHint).toBe(false);
  });
  it("update-activity is destructive and non-idempotent", () => {
    expect(WRITE_DESTRUCTIVE.destructiveHint).toBe(true);
    expect(WRITE_DESTRUCTIVE.idempotentHint).toBe(false);
    expect(WRITE_DESTRUCTIVE.readOnlyHint).toBe(false);
  });
  it("creates are non-destructive but not idempotent", () => {
    expect(WRITE_CREATE.readOnlyHint).toBe(false);
    expect(WRITE_CREATE.destructiveHint).toBe(false);
    expect(WRITE_CREATE.idempotentHint).toBe(false);
  });
  it("idempotent writes are not destructive", () => {
    expect(WRITE_IDEMPOTENT.idempotentHint).toBe(true);
    expect(WRITE_IDEMPOTENT.destructiveHint).toBe(false);
  });

  it("every write constant is explicitly not read-only", () => {
    for (const [label, annotations] of [
      ["WRITE_DESTRUCTIVE", WRITE_DESTRUCTIVE],
      ["WRITE_CREATE", WRITE_CREATE],
      ["WRITE_IDEMPOTENT", WRITE_IDEMPOTENT],
    ] as const) {
      expect(annotations.readOnlyHint, label).toBe(false);
    }
  });
});

/**
 * Every advertised tool and the class it belongs to. A tool absent from this
 * table fails the exhaustiveness check below, so adding one forces a
 * deliberate answer to "does this mutate anything?" — the question the host's
 * permission bucket is derived from.
 *
 * The three `export-*` tools are writes on purpose: they save a file into
 * ROUTE_EXPORT_PATH on the server's own disk. They will keep prompting, and
 * should.
 */
const EXPECTED_CLASS: Record<string, "read" | "create" | "destroy" | "write"> =
  {
    // Reads — the Strava API surface.
    "get-athlete-stats": "read",
    "list-starred-segments": "read",
    "get-segment": "read",
    "explore-segments": "read",
    "get-segment-effort": "read",
    "list-segment-efforts": "read",
    "list-athlete-routes": "read",
    "get-route": "read",
    "get-activity-zones": "read",
    "get-activity-laps": "read",
    "get-activity-photos": "read",
    "get-running-summary": "read",
    "get-aerobic-analysis": "read",
    "get-hill-analysis": "read",
    "get-interval-analysis": "read",
    "get-training-load": "read",
    "get-fitness-trend": "read",
    "compare-activities": "read",
    "get-best-efforts": "read",

    // Reads — MCP App view tools and their app-only data feeds.
    "view-activity-chart": "read",
    "get-activity-streams-raw": "read",
    "view-cadence-trends": "read",
    "get-cadence-trend-data": "read",
    "view-route-map": "read",
    "get-route-map-data": "read",
    "view-activity-segments": "read",
    "get-activity-segments-data": "read",
    "view-training-load": "read",
    "get-training-load-data": "read",
    "view-activity-zones": "read",
    "get-activity-zones-data": "read",
    "view-segment-progress": "read",
    "get-segment-progress-data": "read",
    "view-compare-activities": "read",
    "get-compare-activities-data": "read",

    // Writes.
    "create-activity": "create",
    "update-activity": "destroy",
    "star-segment": "write",
    "export-route-gpx": "write",
    "export-route-tcx": "write",
    "export-activity-gpx": "write",
  };

const ANNOTATIONS_FOR_CLASS = {
  read: READ_ONLY,
  create: WRITE_CREATE,
  destroy: WRITE_DESTRUCTIVE,
  write: WRITE_IDEMPOTENT,
} as const;

describe("tool annotations exhaustiveness", () => {
  it("every tool in TOOLS carries an annotations object", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    for (const tool of TOOLS) {
      expect(
        tool.annotations,
        `${tool.name} is missing annotations`,
      ).toBeDefined();
    }
  });

  it("every tool is classified in the table, and vice versa", () => {
    const advertised = TOOLS.map((t) => t.name).sort();
    const classified = Object.keys(EXPECTED_CLASS).sort();
    // Named both ways so the failure says which side is short.
    expect(
      advertised.filter((name) => !classified.includes(name)),
      "tools missing a permission classification",
    ).toEqual([]);
    expect(
      classified.filter((name) => !advertised.includes(name)),
      "classified names that are no longer advertised",
    ).toEqual([]);
  });

  it("each tool carries exactly the annotations its class prescribes", () => {
    for (const tool of TOOLS) {
      const expected = ANNOTATIONS_FOR_CLASS[EXPECTED_CLASS[tool.name]!];
      expect(tool.annotations, tool.name).toEqual(expected);
    }
  });

  it("every read tool spells out both hints a permission bucket reads", () => {
    const reads = TOOLS.filter((t) => EXPECTED_CLASS[t.name] === "read");
    // Guards the table itself: an empty filter would make this vacuous.
    expect(reads.length).toBe(35);
    for (const tool of reads) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it("no tool opts into an unconditional permission prompt", () => {
    // `_meta["anthropic/requiresUserInteraction"]` makes a host prompt on
    // every call with no "don't ask again" option, and allow-rules do not
    // skip it. Nothing here wants that; pin it so nothing acquires it.
    for (const tool of TOOLS) {
      const meta = tool._meta as Record<string, unknown> | undefined;
      expect(
        meta?.["anthropic/requiresUserInteraction"],
        tool.name,
      ).toBeUndefined();
    }
  });
});

/**
 * Serialization check. The in-memory TOOLS table having correct annotations
 * proves nothing about what the host receives: SDK result schemas can drop
 * fields they do not model, and an annotation that does not reach the wire
 * cannot influence a permission decision. So this drives a real initialize +
 * tools/list through the transport and reads the JSON that comes back.
 */
async function listToolsOverTheWire(): Promise<Array<Record<string, unknown>>> {
  const manager = createMcpSessionManager(createServer);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const init = await manager.handleRequest(
    post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "annotations-test", version: "1.0" },
      },
    }),
  );
  const sessionId = init.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  await init.body?.cancel();

  await manager.handleRequest(
    post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "mcp-session-id": sessionId as string },
    ),
  );

  const response = await manager.handleRequest(
    post(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { "mcp-session-id": sessionId as string },
    ),
  );
  const raw = await response.text();
  // The transport answers on an SSE stream, so the payload is the data: line.
  const line = raw
    .split("\n")
    .find((l) => l.startsWith("data:"))
    ?.slice("data:".length)
    .trim();
  expect(line, `no SSE data line in tools/list response: ${raw}`).toBeTruthy();

  const parsed = JSON.parse(line as string) as {
    result?: { tools?: Array<Record<string, unknown>> };
  };
  await manager.closeAllSessions();
  return parsed.result?.tools ?? [];
}

describe("annotations on the wire", () => {
  it("tools/list serializes every tool's annotations", async () => {
    const tools = await listToolsOverTheWire();

    expect(tools.length).toBe(TOOLS.length);
    for (const tool of tools) {
      const name = tool.name as string;
      const expected = ANNOTATIONS_FOR_CLASS[EXPECTED_CLASS[name]!];
      expect(
        tool.annotations,
        `${name} lost its annotations in transit`,
      ).toEqual(expected);
    }
  });

  it("read-only tools reach the host with destructiveHint present and false", async () => {
    const tools = await listToolsOverTheWire();

    const reads = tools.filter(
      (t) => EXPECTED_CLASS[t.name as string] === "read",
    );
    expect(reads.length).toBe(35);
    for (const tool of reads) {
      const annotations = tool.annotations as Record<string, unknown>;
      // `in` rather than a truthiness check: the failure mode being guarded
      // is the key being dropped for having a falsy value.
      expect(
        "destructiveHint" in annotations,
        `${tool.name} shipped without destructiveHint`,
      ).toBe(true);
      expect(annotations.destructiveHint, tool.name as string).toBe(false);
      expect(annotations.readOnlyHint, tool.name as string).toBe(true);
    }
  });
});

describe("server capabilities", () => {
  it("createServer returns a Server that advertises tools", () => {
    const server = createServer();
    expect(server).toBeInstanceOf(Server);
  });
});
