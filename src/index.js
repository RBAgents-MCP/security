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

/**
 * The accepted `Host` header values, or `null` when the guard is off.
 *
 * Unset means skipped, not guessed at. A wrong list silently refusing every
 * request is a worse failure than an absent one, so there is no default list
 * to fall back to - the caller reports the absence on stderr instead, because
 * silence is indistinguishable from a guard that is working.
 */
function allowedHosts() {
  const configured = (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : null;
}

/**
 * The hostname in a `Host` header, with the port removed.
 *
 * Port-agnostic on purpose. A proxy, a load balancer, and a container port
 * mapping each present a different port for the same server, so an allow-list
 * that matched on the whole header would break the moment the one in front of
 * it changed. Bracketed IPv6 keeps its brackets, since `[::1]` is the form the
 * header actually carries.
 */
function hostName(hostHeader) {
  const value = hostHeader.trim();

  const bracket = value.lastIndexOf("]");
  if (bracket !== -1) return value.slice(0, bracket + 1);

  const colon = value.lastIndexOf(":");
  return colon === -1 ? value : value.slice(0, colon);
}

if (transportName === "http" || transportName === "streamable-http") {
  // Explicit, though the default was already every interface. Node binds all
  // interfaces when listen() is given no host; naming it makes the exposure a
  // decision rather than a default nobody wrote down.
  const host = process.env.HOST ?? "0.0.0.0";
  const bind = host === "0.0.0.0" || host === "::" ? "all interfaces" : host;
  const hosts = allowedHosts();

  const httpServer = createHttpServer(async (req, res) => {
    // DNS-rebinding protection. A browser on a page the user is visiting can be
    // pointed at a loopback or container address, and neither this server nor
    // anything in front of it asks who is asking. The Host header is the only
    // thing tying the request to a deployment the operator chose, so when the
    // operator names one, honour it. A request with no Host header at all is
    // refused rather than waved through.
    if (hosts !== null) {
      const requestHost = req.headers.host;
      if (requestHost === undefined || !hosts.includes(hostName(requestHost))) {
        rpcError(res, 403, -32000, `Host not allowed: ${requestHost ?? "(none)"}`);
        return;
      }
    }

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

  httpServer.listen(port, host, () => {
    const allowList =
      hosts === null
        ? "Host allow-list is off - MCP_ALLOWED_HOSTS is unset"
        : `Host allow-list is ${hosts.join(", ")}`;

    process.stderr.write(
      `${SERVER_ID} ${version} serving over http on ${bind}:${port}/mcp - ${allowList}\n`
    );
  });

  // Drain, then close.
  //
  // close() stops the listener but waits for open connections, so a client
  // holding one keeps the process alive until something kills it - which under
  // `docker stop` is the runtime's SIGKILL after ten seconds, unlogged and
  // uncountable. Measured on this server's shape: a request in flight when
  // close() is called completes fine, but the close callback then waits out the
  // keep-alive window - about 5.5s - before it fires. With the drain below it
  // fires at roughly 0.7s instead, which is bounded rather than incidental.
  //
  // The trade is real and deliberate: a request still running when the window
  // closes is cut off. Every tool here reads one file out of content/ and
  // returns it, so 500ms is orders of magnitude more than a real call needs,
  // and a caller that is being cut off at 500ms was never going to get an
  // answer anyway.
  const DRAIN_MS = 500;
  let draining = false;

  const shutdown = () => {
    // A second signal means the operator has stopped waiting.
    if (draining) process.exit(0);
    draining = true;

    process.stderr.write(`${SERVER_ID} draining for ${DRAIN_MS}ms before closing\n`);
    httpServer.close(() => process.exit(0));

    // unref'd, so this timer never holds the process open by itself. If every
    // connection closes before the window elapses, close()'s callback has
    // already exited and there is nothing left to wait for.
    setTimeout(() => httpServer.closeAllConnections(), DRAIN_MS).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
