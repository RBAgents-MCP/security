/*
 * The MCP server.
 *
 * A fresh instance is created per connection because McpServer holds
 * per-connection state.
 *
 * The tool surface is not declared here. It is built from `content/` by
 * ./tools/from-content.js, so adding a markdown file to the set is what adds a
 * tool. listTools() and the CLI both read the same array, so a tool that existed
 * on one surface and not the other would be impossible rather than merely
 * discouraged.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CONTENT_TOOLS } from "./tools/from-content.js";

export const SERVER_ID = "rbagents-security";
export const SERVER_TITLE = "RBAgents Roblox Security";

/*
 * The whole surface: one tool per file in content/, which is three today.
 *
 * Nothing here takes a verb, a credential, or a path - and that is the point. The
 * old surface took a `path` and guarded it; this one has no argument to guard, so
 * the property a consuming repository depends on is structural rather than
 * enforced. The code that would write is absent, not disabled, and a repository
 * pointed at this server cannot mutate the set.
 *
 * Exported so the test suite can assert this array *is* the whole surface, not
 * only that it is the whole surface `listTools()` reports.
 */
export const TOOL_MODULES = Object.freeze(CONTENT_TOOLS);

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
        "The Roblox security set - client zero-trust, RemoteEvent and RemoteFunction payload validation, and where the client/server trust boundary goes - served read-only. Every file in the set is its own tool and none of them takes an argument: call roblox_security_index to route by the question you are trying to answer, or call trust_boundaries or zero_trust_networking directly when you already know which you need. For language-agnostic web security in python, javascript/typescript, or go, resolve the lxagents-security server as well; this one covers Roblox only.",
    }
  );

  for (const { config, handler } of TOOL_MODULES) {
    // The three-argument form, because no tool declares a schema. A tool that
    // grows one would need the four-argument form back - and, being generated
    // from a markdown file, would have to stop being generated to get it.
    server.tool(config.name, config.description, handler);
  }

  return server;
}
