import { Tooltip, TooltipEntry } from "@strava-mcp/ui";
import { formatPace, formatDuration } from "./normalize";

interface RunTooltipPayloadItem {
  name?: string;
  value?: number;
  payload?: {
    name?: string;
    date?: string;
    distance?: number;
    averageCadence?: number;
    averagePace?: number;
    duration?: number;
  };
}

interface SharedTooltipProps {
  active?: boolean;
  payload?: RunTooltipPayloadItem[];
}

export function SharedTooltip({ active, payload }: SharedTooltipProps) {
  if (!active || !payload?.length) return null;
  const run = payload[0]?.payload;
  if (!run) return null;

  const date = run.date ? new Date(run.date).toLocaleDateString() : "";

  return (
    <Tooltip timestamp={date}>
      {run.name && (
        <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: 4 }}>
          {run.name}
        </div>
      )}
      {run.averageCadence !== undefined && run.averageCadence > 0 && (
        <TooltipEntry color="var(--chart-cadence)" label="Cadence" value={`${run.averageCadence}`} unit="spm" />
      )}
      {run.averagePace !== undefined && run.averagePace > 0 && (
        <TooltipEntry color="var(--chart-pace)" label="Pace" value={formatPace(run.averagePace)} unit="/km" />
      )}
      {run.distance !== undefined && (
        <TooltipEntry color="var(--color-text-tertiary)" label="Distance" value={`${run.distance}`} unit="km" />
      )}
      {run.duration !== undefined && (
        <TooltipEntry color="var(--color-text-tertiary)" label="Duration" value={formatDuration(run.duration)} unit="" />
      )}
    </Tooltip>
  );
}
