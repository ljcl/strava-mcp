import preview, { darkGlobals } from "@strava-mcp/design-system/preview";
import { MobileCardShell } from "@strava-mcp/ui";
import { expect, within } from "storybook/test";
import { mockRuns } from "./__fixtures__/runs";
import { App } from "./App";
import { type CadenceTrendData } from "./types";

const mockData: CadenceTrendData = { weeks: 6, activities: mockRuns };

const meta = preview.meta({ component: App });

export const Default = meta.story({
  args: { app: null, data: mockData },
});

/**
 * Keyboard-accessible run selection (#169). Previously the only way to build an
 * overlay comparison was clicking Recharts dots, which carry no tabindex or key
 * handling. The run picker below the Trend/Scatter charts lets a keyboard user
 * select and deselect runs: focus a chip, activate it, and its `aria-pressed`
 * flips while the selection bar and count update. A second activation deselects.
 */
export const KeyboardRunSelection = meta.story({
  args: { app: null, data: mockData },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const group = canvas.getByRole("group", { name: /compare runs/i });
    const chip = within(group).getByRole("button", {
      name: /Tempo Intervals/,
    });
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    // Select via keyboard: focus the chip and press Enter.
    chip.focus();
    await expect(chip).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(group).toHaveAccessibleName(/1 of 4 selected/);
    // The run now appears in the selection bar with a remove control.
    await expect(
      canvas.getByRole("button", { name: "Remove Tempo Intervals" }),
    ).toBeInTheDocument();

    // Deselect via keyboard: Space toggles it back off.
    await userEvent.keyboard(" ");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(group).toHaveAccessibleName(/0 of 4 selected/);
    await expect(
      within(canvasElement).queryByRole("button", {
        name: "Remove Tempo Intervals",
      }),
    ).toBeNull();
  },
});

export const Dark = meta.story({
  args: { app: null, data: mockData },
  globals: darkGlobals,
});

export const Mobile = meta.story({
  args: { app: null, data: mockData, mode: "mobile" },
  globals: {
    viewport: { value: "claudeIosCard" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (StoryFn) => (
      <MobileCardShell>
        <StoryFn />
      </MobileCardShell>
    ),
  ],
});
