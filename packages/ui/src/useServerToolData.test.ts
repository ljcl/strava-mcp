import { type App } from "@modelcontextprotocol/ext-apps";
import { describe, expect, it } from "vitest";
import { renderHook } from "./renderHook";
import { useServerToolData } from "./useServerToolData";

type CallArgs = Parameters<App["callServerTool"]>[0];

/** Hand-rolled fake App exposing only what the hook calls. */
function fakeApp(respond: (args: CallArgs) => unknown | Promise<unknown>): {
  app: App;
  calls: CallArgs[];
} {
  const calls: CallArgs[] = [];
  const app = {
    callServerTool: async (args: CallArgs) => {
      calls.push(args);
      return await respond(args);
    },
  } as unknown as App;
  return { app, calls };
}

const textResult = (text: string) => ({ content: [{ type: "text", text }] });

/** Let queued microtasks and the hook's state updates settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useServerToolData", () => {
  it("starts loading and resolves with the parsed payload", async () => {
    const { app, calls } = fakeApp(() =>
      textResult(JSON.stringify({ weeks: 6 })),
    );

    const harness = await renderHook(
      ({ args }) => useServerToolData<{ weeks: number }>(app, "get-data", args),
      { args: { days: 84 } },
    );

    expect(calls).toEqual([{ name: "get-data", arguments: { days: 84 } }]);
    await flush();
    expect(harness.current().data).toEqual({ weeks: 6 });
    expect(harness.current().loading).toBe(false);
    expect(harness.current().error).toBeNull();

    await harness.unmount();
  });

  it("reports a parse failure rather than a null payload", async () => {
    const { app } = fakeApp(() => textResult("not json"));

    const harness = await renderHook(
      () => useServerToolData(app, "get-data", {}),
      undefined,
    );
    await flush();

    expect(harness.current().error).toBe("Failed to parse get-data response");
    expect(harness.current().data).toBeNull();
    expect(harness.current().loading).toBe(false);

    await harness.unmount();
  });

  it("reports a response carrying no text content", async () => {
    const { app } = fakeApp(() => ({ content: [] }));

    const harness = await renderHook(
      () => useServerToolData(app, "get-data", {}),
      undefined,
    );
    await flush();

    expect(harness.current().error).toBe("Failed to parse get-data response");

    await harness.unmount();
  });

  it("surfaces a thrown call as the error", async () => {
    const { app } = fakeApp(() => {
      throw new Error("host disconnected");
    });

    const harness = await renderHook(
      () => useServerToolData(app, "get-data", {}),
      undefined,
    );
    await flush();

    expect(harness.current().error).toBe("Error: host disconnected");
    expect(harness.current().loading).toBe(false);

    await harness.unmount();
  });

  it("re-invokes callServerTool on retry", async () => {
    let attempt = 0;
    const { app, calls } = fakeApp(() => {
      attempt += 1;
      if (attempt === 1) throw new Error("flaky");
      return textResult(JSON.stringify({ ok: true }));
    });

    const harness = await renderHook(
      () => useServerToolData<{ ok: boolean }>(app, "get-data", {}),
      undefined,
    );
    await flush();
    expect(harness.current().error).toBe("Error: flaky");

    harness.current().retry();
    await flush();

    expect(calls).toHaveLength(2);
    expect(harness.current().data).toEqual({ ok: true });
    expect(harness.current().error).toBeNull();

    await harness.unmount();
  });

  it("does not refetch for a new-but-equal args object", async () => {
    const { app, calls } = fakeApp(() => textResult(JSON.stringify({})));

    const harness = await renderHook(
      ({ days }) => useServerToolData(app, "get-data", { days }),
      { days: 84 },
    );
    await flush();
    expect(calls).toHaveLength(1);

    // A fresh object literal with the same contents — the args key is the
    // JSON serialization, so this must not re-enter the fetch.
    await harness.rerender({ days: 84 });
    await flush();
    expect(calls).toHaveLength(1);

    await harness.unmount();
  });

  it("refetches when the args actually change", async () => {
    const { app, calls } = fakeApp(() => textResult(JSON.stringify({})));

    const harness = await renderHook(
      ({ days }) => useServerToolData(app, "get-data", { days }),
      { days: 84 },
    );
    await flush();

    await harness.rerender({ days: 42 });
    await flush();

    expect(calls).toEqual([
      { name: "get-data", arguments: { days: 84 } },
      { name: "get-data", arguments: { days: 42 } },
    ]);

    await harness.unmount();
  });

  it("stays loading with no app, and fetches once one connects", async () => {
    const { app, calls } = fakeApp(() => textResult(JSON.stringify({})));

    const harness = await renderHook(
      ({ connected }) => useServerToolData(connected, "get-data", {}),
      { connected: null } as { connected: App | null },
    );
    await flush();

    expect(calls).toHaveLength(0);
    expect(harness.current().loading).toBe(true);

    await harness.rerender({ connected: app });
    await flush();

    expect(calls).toHaveLength(1);
    expect(harness.current().loading).toBe(false);

    await harness.unmount();
  });
});
