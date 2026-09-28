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

import robloxSecurityInstruction from "./tools/roblox-security-instruction.js";

export const SERVER_ID = "rbagents-security";
export const SERVER_TITLE = "RBAgents Roblox Security";

/*
 * The whole surface. Nothing here takes a verb, and no tool in this repository
 * reaches a network or a credential - the code that would write is absent, not
 * disabled. A repository pointed at this server cannot mutate the set.
 */
const TOOL_MODULES = Object.freeze([robloxSecurityInstruction]);

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
    {
      instructions:
        "The Roblox security set - client zero-trust, RemoteEvent and RemoteFunction payload validation, and where the client/server trust boundary goes - served read-only. Call roblox_security_instruction with a path to read one file. Start at 'index/roblox-security-index.md': it routes the two files under 'roblox/security/' by the question you are trying to answer. For language-agnostic web security in python, javascript/typescript, or go, resolve the lxagents-security server as well; this one covers Roblox only.",
    }
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
