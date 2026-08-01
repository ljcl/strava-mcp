/**
 * The MCP protocol surface, asserted through the real server (#270).
 *
 * Every other server suite enters below the protocol layer — calling
 * `dispatchToolCall` directly, or building a throwaway `new Server()` with no
 * tools on it. That leaves the wiring between transport and handlers
 * unverified: a dropped `setRequestHandler`, an input schema that serialises
 * to something a host cannot generate against, or a broken app-resource
 * template would all ship green.
 *
 * So these drive a real session and assert the JSON that comes back. The
 * suite is deliberately the last piece of epic #284, so it asserts the
 * finished surface — the output schemas, the `logging` capability, and the
 * progress plumbing — rather than being amended three times on the way.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActivityById, getSegmentById } from "./stravaClient";

vi.mock("./stravaClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stravaClient")>();
  return { ...actual, getSegmentById: vi.fn(), getActivityById: vi.fn() };
});

// Dispatch resolves the token before any handler runs (#240), so without this
// an end-to-end tools/call reads the real token store.
vi.mock("./tokenManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenManager")>();
  return { ...actual, getStravaToken: vi.fn(async () => "test-token") };
});

const { connectTestClient } = await import("./mcpTestClient");
const { TOOLS } = await import("./server");

const mockedSegment = vi.mocked(getSegmentById);
const mockedActivity = vi.mocked(getActivityById);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("initialize", () => {
  it("advertises every capability the server implements", async () => {
    const { initializeResult } = await connectTestClient();

    expect(initializeResult.capabilities).toMatchObject({
      tools: expect.any(Object),
      resources: expect.any(Object),
      prompts: expect.any(Object),
      logging: expect.any(Object),
    });
  });

  it("returns a protocol version and server identity", async () => {
    const { initializeResult } = await connectTestClient();

    expect(initializeResult.protocolVersion).toBeTruthy();
    expect(initializeResult.serverInfo).toMatchObject({
      name: expect.any(String),
      version: expect.any(String),
    });
  });
});

describe("tools/list", () => {
  it("returns every advertised tool", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("tools/list");
    const tools = result?.tools as Array<Record<string, unknown>>;

    expect(tools).toHaveLength(TOOLS.length);
  });

  it("gives every tool a well-formed object inputSchema", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("tools/list");
    const tools = result?.tools as Array<Record<string, unknown>>;

    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, unknown> | undefined;
      expect(schema, `${String(tool.name)} has no inputSchema`).toBeTruthy();
      // A host generates arguments against this; anything but an object
      // schema with a properties bag is unusable to it.
      expect(schema?.type, `${String(tool.name)} inputSchema.type`).toBe(
        "object",
      );
      expect(
        typeof schema?.properties,
        `${String(tool.name)} inputSchema.properties`,
      ).toBe("object");
      // $ref/$defs would have to be resolved by the host against a schema
      // document it never receives.
      expect(JSON.stringify(schema)).not.toContain("$ref");
    }
  });

  it("keeps every published outputSchema an object schema too", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("tools/list");
    const tools = result?.tools as Array<Record<string, unknown>>;

    const withOutput = tools.filter((t) => t.outputSchema);
    // The epic's schema batch published these; a caller branches on
    // `structuredContent` against them.
    expect(withOutput.length).toBeGreaterThan(0);
    for (const tool of withOutput) {
      const schema = tool.outputSchema as Record<string, unknown>;
      expect(schema.type, `${String(tool.name)} outputSchema.type`).toBe(
        "object",
      );
    }
  });

  it("advertises Strava ids as strings, never as numbers", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("tools/list");
    const tools = result?.tools as Array<Record<string, unknown>>;

    // Route and segment-effort ids already exceed 2^53, so a host that
    // generates a JSON number loses digits before validation can see them.
    for (const tool of tools) {
      const schema = tool.inputSchema as {
        properties?: Record<string, unknown>;
      };
      for (const [field, raw] of Object.entries(schema.properties ?? {})) {
        if (!/(^|_)(id|Id)$/.test(field)) continue;
        const prop = raw as { type?: unknown };
        expect(
          prop.type,
          `${String(tool.name)}.${field} must be advertised as a string`,
        ).toBe("string");
      }
    }
  });
});

describe("tools/call", () => {
  it("round-trips a tool's content through the transport", async () => {
    mockedSegment.mockResolvedValueOnce({
      id: "229781",
      name: "Hawk Hill",
      distance: 2684,
      average_grade: 5.7,
      maximum_grade: 14.2,
      elevation_high: 245.3,
      elevation_low: 92.4,
      total_elevation_gain: 155.7,
      climb_category: 1,
      city: "San Francisco",
      state: "CA",
      country: "United States",
      private: false,
      starred: false,
      effort_count: 60449,
      athlete_count: 30623,
    } as never);

    const client = await connectTestClient();
    const { result, error } = await client.send("tools/call", {
      name: "get-segment",
      arguments: { segmentId: "229781" },
    });

    expect(error).toBeUndefined();
    const content = result?.content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("Hawk Hill");
  });

  it("delivers structuredContent alongside the text", async () => {
    mockedSegment.mockResolvedValueOnce({
      id: "229781",
      name: "Hawk Hill",
      distance: 2684,
      average_grade: 5.7,
      maximum_grade: 14.2,
      elevation_high: 245.3,
      elevation_low: 92.4,
      total_elevation_gain: 155.7,
      climb_category: 1,
      private: false,
      starred: false,
      effort_count: 1,
      athlete_count: 1,
    } as never);

    const client = await connectTestClient();
    const { result } = await client.send("tools/call", {
      name: "get-segment",
      arguments: { segmentId: "229781" },
    });

    // The point of #243: a caller chains on fields instead of regexing ids
    // out of prose. That only holds if the SDK actually serialises them.
    expect(result?.structuredContent).toMatchObject({ id: "229781" });
  });

  it("returns a tool error as isError, not a JSON-RPC error", async () => {
    const client = await connectTestClient();
    const { result, error } = await client.send("tools/call", {
      name: "get-segment",
      arguments: { segmentId: "not-an-id" },
    });

    // A tool that rejects its arguments is a normal result the model can read
    // and correct, not a protocol failure.
    expect(error).toBeUndefined();
    expect(result?.isError).toBe(true);
  });

  it("answers an unknown tool without breaking the session", async () => {
    const client = await connectTestClient();

    const unknown = await client.send("tools/call", {
      name: "no-such-tool",
      arguments: {},
    });
    expect(unknown.result?.isError).toBe(true);

    // The session survives it: a bad call must not poison the transport.
    const after = await client.send("tools/list");
    expect((after.result?.tools as unknown[] | undefined)?.length).toBe(
      TOOLS.length,
    );
  });

  it("keeps a 64-bit id intact end to end", async () => {
    mockedActivity.mockResolvedValueOnce({
      id: "9007199254740993",
      name: "Long Run",
      type: "Run",
      distance: 10000,
      moving_time: 3000,
    } as never);

    const client = await connectTestClient();
    await client.send("tools/call", {
      name: "view-activity-chart",
      arguments: { activity_id: "9007199254740993" },
    });

    // 2^53 + 1 survives only because ids travel as strings and the body is
    // parsed with `parseJsonWithLargeInts`; a JSON number would arrive as
    // ...992 with the true digits unrecoverable.
    const [, id] = mockedActivity.mock.calls[0]!;
    expect(String(id)).toBe("9007199254740993");
  });
});

describe("resources/list", () => {
  it("lists every MCP App resource with its ui:// uri", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("resources/list");
    const resources = result?.resources as Array<Record<string, unknown>>;

    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(String(resource.uri)).toMatch(/^ui:\/\//);
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
    }
  });

  it("carries the card-chrome _meta each app depends on", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("resources/list");
    const resources = result?.resources as Array<Record<string, unknown>>;

    // `prefersBorder: false` on the descriptor is half of the convention —
    // the apps draw their own card, and a host border would double it.
    for (const resource of resources) {
      const meta = resource._meta as { ui?: Record<string, unknown> };
      expect(meta?.ui, `${String(resource.uri)} has no _meta.ui`).toBeTruthy();
      expect(meta.ui?.prefersBorder).toBe(false);
    }
  });
});

describe("resources/read", () => {
  it("returns the app HTML for a declared resource", async () => {
    const client = await connectTestClient();
    const list = await client.send("resources/list");
    const resources = list.result?.resources as
      | Array<{ uri: string }>
      | undefined;
    const first = resources?.[0];
    expect(first).toBeTruthy();

    const { result, error } = await client.send("resources/read", {
      uri: first!.uri,
    });

    expect(error).toBeUndefined();
    const contents = result?.contents as Array<Record<string, unknown>>;
    expect(contents[0]?.uri).toBe(first!.uri);
    // The single-file build is the whole point: a bundle that fails to
    // resolve at runtime would read as an empty or missing document here.
    expect(String(contents[0]?.text)).toContain("<html");
  });

  it("repeats the _meta on the content response, not only the descriptor", async () => {
    const client = await connectTestClient();
    const list = await client.send("resources/list");
    const resources = list.result?.resources as
      | Array<{ uri: string }>
      | undefined;
    const first = resources?.[0];
    expect(first).toBeTruthy();

    const { result } = await client.send("resources/read", { uri: first!.uri });

    // Hosts read it from the descriptor or from the content they just
    // fetched; the convention is to emit it on both.
    const contents = result?.contents as Array<{
      _meta?: { ui?: Record<string, unknown> };
    }>;
    expect(contents[0]?._meta?.ui?.prefersBorder).toBe(false);
  });

  it("rejects a uri the server does not serve", async () => {
    const client = await connectTestClient();

    const { error } = await client.send("resources/read", {
      uri: "ui://no-such-app/app.html",
    });

    expect(error).toBeTruthy();
  });
});

describe("prompts", () => {
  it("lists prompts with names and descriptions", async () => {
    const client = await connectTestClient();
    const { result } = await client.send("prompts/list");
    const prompts = result?.prompts as Array<Record<string, unknown>>;

    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(typeof prompt.name).toBe("string");
      expect(typeof prompt.description).toBe("string");
    }
  });

  it("renders a prompt's messages through prompts/get", async () => {
    const client = await connectTestClient();
    const list = await client.send("prompts/list");
    const prompts = list.result?.prompts as Array<{ name: string }> | undefined;
    const first = prompts?.[0];
    expect(first).toBeTruthy();

    const { result, error } = await client.send("prompts/get", {
      name: first!.name,
      arguments: {},
    });

    expect(error).toBeUndefined();
    const messages = result?.messages as Array<{
      role: string;
      content: { type: string; text: string };
    }>;
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.content.type).toBe("text");
    expect(messages[0]?.content.text.length).toBeGreaterThan(0);
  });
});
