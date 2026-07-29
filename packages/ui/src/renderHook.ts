import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

interface HookHarness<TProps, TResult> {
  /** The hook's return value from the most recent render. */
  current: () => TResult;
  /** Re-render with new props, awaiting effects. */
  rerender: (props: TProps) => Promise<void>;
  /** Unmount, running cleanup effects. */
  unmount: () => Promise<void>;
}

/**
 * Minimal render-a-hook harness. The repo has no React testing library and
 * does not need one for this: hooks are the only thing here that cannot be
 * tested as a pure function or through a story, and a component that just
 * calls the hook is enough to exercise it (#272).
 */
export async function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  initialProps: TProps,
): Promise<HookHarness<TProps, TResult>> {
  // React refuses to run `act` without this, and warns loudly if it is set
  // while the app renders for real.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement("div");
  document.body.appendChild(container);

  let latest!: TResult;
  const Probe = (props: { hookProps: TProps }) => {
    latest = hook(props.hookProps);
    return null;
  };

  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(Probe, { hookProps: initialProps }));
  });

  return {
    current: () => latest,
    rerender: async (props) => {
      await act(async () => {
        root.render(createElement(Probe, { hookProps: props }));
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}
