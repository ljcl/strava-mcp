import preview from "@strava-mcp/design-system/preview";
import { Pill, PillGroup } from "./Pill";

function PillDemo() {
  return (
    <PillGroup>
      <Pill active>Effort</Pill>
      <Pill>Power</Pill>
      <Pill>Form</Pill>
      <Pill>All</Pill>
    </PillGroup>
  );
}

const meta = preview.meta({ component: PillDemo });

export const Default = meta.story({});
