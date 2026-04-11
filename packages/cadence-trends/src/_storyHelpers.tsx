import { type ReactNode } from "react";

/**
 * Renders the story inside the same bordered card shell that main.tsx
 * uses in the MCP app so mobile previews reflect what ships to hosts.
 * `layout: "fullscreen"` on the story removes Storybook's outer padding
 * so the card sits directly against the iframe edge with only the 3px
 * outer margin that main.tsx applies on mobile.
 */
export function MobileCardShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: 3,
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "16px 14px",
      }}
    >
      {children}
    </div>
  );
}
