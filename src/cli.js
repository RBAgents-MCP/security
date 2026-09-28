#!/usr/bin/env node

import { listTools } from "./server.js";
import { version } from "./version.js";

const HELP = `template - MCP server and CLI for template

Usage
  template

Commands
  serve            Run as an MCP server
  tools            List the tools this server exposes

Options
  -h, --help       Show this help
  -v, --version    Show the version

Environment
  API_KEY          Unified key for the tools that require authentication
  MCP_TRANSPORT    stdio (default) or http
  PORT             HTTP port, default 3000`;

const [command, ...rest] = process.argv.slice(2);

if (command === "-v" || command === "--version") {
  process.stdout.write(`${version}\n`);
} else if (!command || command === "-h" || command === "--help" || command === "help") {
  process.stdout.write(`${HELP}\n`);
  process.exitCode = command ? 0 : 2;
} else if (command === "serve") {
  if (rest.includes("--http")) process.env.MCP_TRANSPORT = "http";
  if (rest.includes("--stdio")) process.env.MCP_TRANSPORT = "stdio";

  const portFlag = rest.indexOf("--port");
  if (portFlag !== -1 && rest[portFlag + 1]) process.env.PORT = rest[portFlag + 1];

  await import("./index.js");
} else if (command === "tools") {
  const tools = listTools();
  const width = Math.max(0, ...tools.map((tool) => tool.name.length));

  for (const tool of tools) {
    process.stdout.write(`${tool.name.padEnd(width)}  ${tool.description}\n`);
  }
} else {
  process.stderr.write(`Unknown command "${command}". Try --help.\n`);
  process.exitCode = 2;
}
