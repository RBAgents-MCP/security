#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SERVER_ID, createServer } from "./server.js";
import { version } from "./version.js";

const transportName = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function rpcError(res, status, code, message) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

if (transportName === "http" || transportName === "streamable-http") {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: SERVER_ID, version }));
      return;
    }

    if (req.url !== "/mcp") {
      rpcError(res, 404, -32601, `Not found: ${req.url}`);
      return;
    }

    if (req.method !== "POST") {
      rpcError(res, 405, -32000, `${req.method} is not supported in stateless mode`);
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      rpcError(res, 400, -32700, "Parse error: request body is not valid JSON");
      return;
    }

    const server = createServer({ version });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) rpcError(res, 500, -32603, String(error));
    }
  });

  httpServer.listen(port, () => {
    process.stderr.write(`${SERVER_ID} ${version} serving over http on :${port}/mcp\n`);
  });

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
