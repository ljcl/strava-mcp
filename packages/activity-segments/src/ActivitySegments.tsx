import { Collapsible } from "@base-ui/react/collapsible";
import { isRunning } from "@strava-mcp/data";
import { type ReactNode, useMemo } from "react";
import styles from "./ActivitySegments.module.css";
import {
  buildHeatDomain,
  type Domain,
  formatClock,
  formatEffortPace,
  heatColor,
  runOrder,
  selectHighlights,
  summaryCounts,
} from "./segments";
import { type ActivitySegmentsData, type SegmentEffortRow } from "./types";

interface ActivitySegmentsProps {
  data: ActivitySegmentsData;
  mode: "mobile" | "desktop";
}

/** "12 segments, 2 PRs, 1 top-10" — plural-aware, omits zero tiers. */
function summaryLine(data: ActivitySegmentsData): string {
  const counts = summaryCounts(data.segments);
  const parts = [
    `${counts.total} ${counts.total === 1 ? "segment" : "segments"}`,
  ];
  if (counts.prs > 0)
    parts.push(`${counts.prs} ${counts.prs === 1 ? "PR" : "PRs"}`);
  if (counts.top10 > 0) parts.push(`${counts.top10} top-10`);
  return parts.join(", ");
}

function formatGrade(grade: number): string {
  return `${grade >= 0 ? "+" : ""}${grade.toFixed(1)}%`;
}

export function ActivitySegments({ data, mode }: ActivitySegmentsProps) {
  const isMobile = mode === "mobile";
  const activityType = data.activityType;

  const domain = useMemo(() => buildHeatDomain(data.segments), [data.segments]);
  const highlights = useMemo(
    () => selectHighlights(data.segments),
    [data.segments],
  );
  const all = useMemo(() => runOrder(data.segments), [data.segments]);

  return (
    <div className={styles.container} data-compact={isMobile || undefined}>
      <div className={styles.header}>
        <div className={styles.title}>{data.name}</div>
        <div className={styles.subtitle}>{summaryLine(data)}</div>
      </div>

      {data.segments.length === 0 ? (
        <div className={styles.empty}>No segments in this activity</div>
      ) : (
        <>
          {highlights.length > 0 && (
            <SegmentGroup
              title="Highlights"
              rows={highlights}
              domain={domain}
              activityType={activityType}
            />
          )}
          <SegmentGroup
            title="All segments"
            rows={all}
            domain={domain}
            activityType={activityType}
          />
        </>
      )}
    </div>
  );
}

interface SegmentGroupProps {
  title: string;
  rows: SegmentEffortRow[];
  domain: Domain;
  activityType: string | null;
}

function SegmentGroup({
  title,
  rows,
  domain,
  activityType,
}: SegmentGroupProps) {
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{title}</div>
      <div className={styles.rows}>
        {rows.map((effort) => (
          <Row
            key={`${effort.segmentId}-${effort.startIndex ?? "x"}`}
            effort={effort}
            domain={domain}
            activityType={activityType}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  effort: SegmentEffortRow;
  domain: Domain;
  activityType: string | null;
}

function Row({ effort, domain, activityType }: RowProps) {
  const running = activityType ? isRunning(activityType) : true;
  const tier =
    effort.prRank != null
      ? { kind: "pr" as const, label: `PR ${effort.prRank}` }
      : effort.komRank != null
        ? { kind: "top10" as const, label: `Top ${effort.komRank}` }
        : null;

  const details: Array<{ label: string; value: string }> = [];
  if (effort.averageHeartrate != null) {
    const max =
      effort.maxHeartrate != null ? `/${Math.round(effort.maxHeartrate)}` : "";
    details.push({
      label: "HR",
      value: `${Math.round(effort.averageHeartrate)}${max}`,
    });
  }
  if (effort.averageCadence != null) {
    details.push({
      label: "Cadence",
      value: `${Math.round(effort.averageCadence)} ${running ? "spm" : "rpm"}`,
    });
  }
  if (effort.deviceWatts && effort.averageWatts != null) {
    details.push({
      label: "Power",
      value: `${Math.round(effort.averageWatts)} W`,
    });
  }
  details.push({
    label: "Max grade",
    value: `${effort.maximumGrade.toFixed(1)}%`,
  });
  details.push({ label: "Moving", value: formatClock(effort.movingTime) });

  return (
    <Collapsible.Root className={styles.row}>
      <Collapsible.Trigger className={styles.trigger}>
        <span
          className={styles.dot}
          style={{ background: heatColor(effort, domain) }}
        />
        <span className={styles.body}>
          <span className={styles.line1}>
            <span className={styles.name}>{effort.name}</span>
            {tier && (
              <span className={styles.badge} data-tier={tier.kind}>
                {tier.label}
              </span>
            )}
            <span className={styles.clock}>
              {formatClock(effort.elapsedTime)}
            </span>
          </span>
          <span className={styles.line2}>
            <span className={styles.meta}>
              {formatEffortPace(effort, activityType)}
            </span>
            <span className={styles.sep}>·</span>
            <span className={styles.meta}>
              {(effort.distanceMeters / 1000).toFixed(2)} km
            </span>
            <span className={styles.sep}>·</span>
            <span className={styles.meta}>
              {formatGrade(effort.averageGrade)}
            </span>
          </span>
        </span>
        <Chevron />
      </Collapsible.Trigger>
      <Collapsible.Panel className={styles.panel}>
        <div className={styles.detail}>
          {details.map((d) => (
            <div key={d.label} className={styles.detailItem}>
              <span className={styles.detailLabel}>{d.label}</span>
              <span className={styles.detailValue}>{d.value}</span>
            </div>
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function Chevron(): ReactNode {
  return (
    <svg
      className={styles.chevron}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
