#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allowedHosts, createApp } from "./app.js";
import { SERVER_ID, createServer } from "./server.js";
import { version } from "./version.js";

const transportName = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (transportName === "http" || transportName === "streamable-http") {
  // Explicit, though the default was already every interface. Node binds all
  // interfaces when listen() is given no host; naming it makes the exposure a
  // decision rather than a default nobody wrote down.
  const host = process.env.HOST ?? "0.0.0.0";
  const bind = host === "0.0.0.0" || host === "::" ? "all interfaces" : host;

  // Read here as well as in the application, because the startup line has to say
  // which of the two states this process is in. One helper, two callers.
  const hosts = allowedHosts();

  const httpServer = createApp().listen(port, host, () => {
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
  //
  // A cluster changes how many requests are in flight, not how long one takes,
  // so this window is measured the same way after the fork.
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
