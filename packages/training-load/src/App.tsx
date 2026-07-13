import { type useApp } from "@modelcontextprotocol/ext-apps/react";
import { getChartTokens } from "@strava-mcp/design-system";
import {
  Legend,
  LegendItem,
  SummaryBar,
  useModelContextSync,
} from "@strava-mcp/ui";
import { useMemo, useState } from "react";
import styles from "./App.module.css";
import { buildTrainingLoadContextSummary } from "./contextSummary";
import { LoadChart } from "./LoadChart";
import { buildTotalsStats, countWarningWeeks } from "./normalize";
import { type TrainingLoadData } from "./types";

interface AppProps {
  app: ReturnType<typeof useApp>["app"];
  data: TrainingLoadData;
  mode?: "mobile" | "desktop";
}

export function App({ app, data, mode = "desktop" }: AppProps) {
  const isMobile = mode === "mobile";
  const [showTrend, setShowTrend] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);

  const totalsStats = useMemo(() => buildTotalsStats(data.totals), [data]);
  const warningWeeks = useMemo(() => countWarningWeeks(data.weeks), [data]);

  useModelContextSync(
    app ?? undefined,
    () => buildTrainingLoadContextSummary(data),
    [data],
  );

  return (
    <div className={styles.container} data-compact={isMobile || undefined}>
      <SummaryBar compact={isMobile} stats={totalsStats} />
      <div className={styles.viewContainer}>
        <LoadChart
          weeks={data.weeks}
          showTrend={showTrend}
          showWarnings={showWarnings}
          mode={mode}
        />
      </div>
      {data.weeks.length > 0 && (
        <div className={styles.footer}>
          <Legend size={getChartTokens(mode).legendSize}>
            <LegendItem
              color="var(--chart-cadence)"
              label="Trend"
              hidden={!showTrend}
              onClick={() => setShowTrend((v) => !v)}
            />
            {warningWeeks > 0 && (
              <LegendItem
                color="var(--chart-heartrate)"
                label={`Warning weeks (${warningWeeks})`}
                hidden={!showWarnings}
                onClick={() => setShowWarnings((v) => !v)}
              />
            )}
          </Legend>
        </div>
      )}
    </div>
  );
}
