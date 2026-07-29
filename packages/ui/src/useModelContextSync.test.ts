import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "./renderHook";
import {
  type ModelContextApp,
  useModelContextSync,
} from "./useModelContextSync";

const DEBOUNCE_MS = 600;

interface FakeApp extends ModelContextApp {
  updates: string[];
}

function fakeApp(options?: { capable?: boolean; reject?: boolean }): FakeApp {
  const updates: string[] = [];
  return {
    updates,
    getHostCapabilities: () =>
      options?.capable === false ? {} : { updateModelContext: true },
    updateModelContext: ({ content }) => {
      updates.push(content[0]!.text);
      return options?.reject
        ? Promise.reject(new Error("host rejected"))
        : Promise.resolve(undefined);
    },
  };
}

/** Advance past the debounce and let the resulting promise settle. */
async function settleDebounce() {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
}

describe("useModelContextSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the summary after the debounce, not before", async () => {
    const app = fakeApp();

    const harness = await renderHook(
      () => useModelContextSync(app, () => "viewing week 6", []),
      undefined,
    );

    expect(app.updates).toEqual([]);
    await settleDebounce();
    expect(app.updates).toEqual(["viewing week 6"]);

    await harness.unmount();
  });

  it("coalesces rapid dep changes into the last summary", async () => {
    const app = fakeApp();

    const harness = await renderHook(
      ({ view }: { view: string }) =>
        useModelContextSync(app, () => `viewing ${view}`, [view]),
      { view: "trend" },
    );

    await harness.rerender({ view: "scatter" });
    await harness.rerender({ view: "zones" });
    await settleDebounce();

    // Each dep change restarts the timer, so only the last view is reported.
    expect(app.updates).toEqual(["viewing zones"]);

    await harness.unmount();
  });

  it("no-ops when the host does not advertise the capability", async () => {
    const app = fakeApp({ capable: false });

    const harness = await renderHook(
      () => useModelContextSync(app, () => "viewing week 6", []),
      undefined,
    );
    await settleDebounce();

    expect(app.updates).toEqual([]);

    await harness.unmount();
  });

  it("no-ops without an app", async () => {
    const harness = await renderHook(
      () => useModelContextSync(undefined, () => "viewing week 6", []),
      undefined,
    );

    await expect(settleDebounce()).resolves.toBeUndefined();

    await harness.unmount();
  });

  it("skips the update while the summary is not ready", async () => {
    const app = fakeApp();

    const harness = await renderHook(
      () => useModelContextSync(app, () => null, []),
      undefined,
    );
    await settleDebounce();

    expect(app.updates).toEqual([]);

    await harness.unmount();
  });

  it("swallows a host rejection instead of crashing the view", async () => {
    const app = fakeApp({ reject: true });

    const harness = await renderHook(
      () => useModelContextSync(app, () => "viewing week 6", []),
      undefined,
    );
    await settleDebounce();

    expect(app.updates).toEqual(["viewing week 6"]);

    await harness.unmount();
  });

  it("cancels a pending update on unmount", async () => {
    const app = fakeApp();

    const harness = await renderHook(
      () => useModelContextSync(app, () => "viewing week 6", []),
      undefined,
    );

    await harness.unmount();
    await settleDebounce();

    expect(app.updates).toEqual([]);
  });

  it("reads the latest summary builder, not the one the timer started with", async () => {
    const app = fakeApp();

    const harness = await renderHook(
      ({ label }: { label: string }) =>
        // `label` is deliberately not a dep: the builder is held in a ref, so
        // the fired timer must still report the newest closure's text.
        useModelContextSync(app, () => `viewing ${label}`, []),
      { label: "trend" },
    );

    await harness.rerender({ label: "zones" });
    await settleDebounce();

    expect(app.updates).toEqual(["viewing zones"]);

    await harness.unmount();
  });
});
