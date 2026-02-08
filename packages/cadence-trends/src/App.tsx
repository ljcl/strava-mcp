import type { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CadenceTrendData } from "./types";

interface AppProps {
  app: ReturnType<typeof useApp>["app"];
  data: CadenceTrendData;
}

export function App({ data }: AppProps) {
  return (
    <div style={{ padding: "16px" }}>
      <p>Loaded {data.activities.length} runs over {data.weeks} weeks</p>
    </div>
  );
}
