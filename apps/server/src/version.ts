import { createRequire } from "node:module";

/**
 * Version advertised by the MCP server and /health (#129), sourced from the
 * root package.json that release-please bumps on every release — the server
 * previously hardcoded "1.0.0" while the release line was 2.x. Resolved at
 * runtime so dev (workspace) and the Docker runner (pruned tree, root
 * package.json at /app/package.json) both find it.
 */
export const SERVER_VERSION: string = createRequire(import.meta.url)(
  "../../../package.json",
).version;
