import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";

function Root() {
  return <div style={{ padding: "24px" }}>Cadence Trends — scaffold working</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
