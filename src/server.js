/*
 * The MCP server.
 *
 * A fresh instance is created per connection because McpServer holds
 * per-connection state.
 *
 * Every tool lives in its own file under ./tools/. Adding one means two edits:
 * the new file, and an import plus an entry in TOOL_MODULES below. Nothing else
 * registers tools - listTools() and the CLI both read this array, so a tool
 * registered outside it would be invisible to both.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import calculateSum from "./tools/calculate_sum.js";
import getSecureSummary from "./tools/get_secure_summary.js";
import getServerTime from "./tools/get_server_time.js";
import searchSecureData from "./tools/search_secure_data.js";

export const SERVER_ID = "template";
export const SERVER_TITLE = "Template";

const TOOL_MODULES = Object.freeze([
  getServerTime,
  getSecureSummary,
  calculateSum,
  searchSecureData,
]);

/**
 * The registered tools, as name/description pairs.
 *
 * The CLI prints this rather than keeping a list of its own, so the two
 * surfaces cannot drift apart.
 *
 * @returns {{ name: string, description: string }[]}
 */
export function listTools() {
  return TOOL_MODULES.map(({ config }) => ({
    name: config.name,
    description: config.description,
  }));
}

/**
 * @param {{ version: string }} options
 * @returns {McpServer}
 */
export function createServer({ version }) {
  const server = new McpServer(
    { name: SERVER_ID, title: SERVER_TITLE, version },
    { instructions: `${SERVER_TITLE} - call the tools listed below.` }
  );

  for (const { config, handler } of TOOL_MODULES) {
    if (config.schema) {
      server.tool(config.name, config.description, config.schema, handler);
    } else {
      server.tool(config.name, config.description, handler);
    }
  }

  return server;
}
