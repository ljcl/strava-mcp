import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { createServer } from "./server";

// Load .env file from monorepo root
dotenv.config({
  path: path.resolve(import.meta.dirname, "..", "..", "..", ".env"),
});

async function main() {
  try {
    console.error("Starting Strava MCP Server...");
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Strava MCP Server connected via Stdio. Tools registered.");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

void main();
