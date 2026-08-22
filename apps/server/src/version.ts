import { createRequire } from "node:module";

/**
 * Version advertised by the MCP server and /health, sourced from the root
 * package.json that release-please bumps on every release — never hardcoded,
 * which is how an advertised version drifts from the shipped one. Resolved at
 * runtime so dev (workspace) and the Docker runner (pruned tree, root
 * package.json at /app/package.json) both find it.
 */
export const SERVER_VERSION: string = createRequire(import.meta.url)(
  "../../../package.json",
).version;
