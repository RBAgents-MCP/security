#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allowedHosts, createApp } from "./app.js";
import { SERVER_ID, createServer } from "./server.js";
import { version } from "./version.js";

const transportName = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

/*
 * The bind address, named rather than implied.
 *
 * listen(port) with no host binds every interface, which is what a published port needs
 * and what a container gets - but it is a decision nobody made, so it is made here,
 * visibly. HOST=127.0.0.1 is the way to take it back.
 */
const host = process.env.HOST ?? "0.0.0.0";
const bind = host === "0.0.0.0" || host === "::" ? "all interfaces" : host;

// Read here as well as in the application, because the startup line has to say
// which of the two states this process is in. One helper, two callers.
const hosts = allowedHosts();

/**
 * How many HTTP workers to run, and where the number came from.
 *
 * `MCP_CLUSTER_WORKERS` overrides the count. A value of 1 means no forking at all -
 * one process, one listener, the pre-cluster behaviour - which is what makes the
 * cluster change bisectable: the same code answers, with and without workers, and a
 * difference between them is a difference in the fork rather than in the transport.
 *
 * Unset, or set to something that is not a positive integer, the count is the number of
 * CPUs the process was actually given, not a constant: a container with two CPUs gets
 * two workers and a laptop does not get eight.
 *
 * The source is returned alongside the count because the no-fork startup line names
 * it, and naming the variable when the number came from the CPU count would be a
 * statement about a variable nobody set.
 *
 * @returns {{ count: number, source: string }}
 */
function workerCount() {
  const configured = Number.parseInt(process.env.MCP_CLUSTER_WORKERS ?? "", 10);
  if (Number.isInteger(configured) && configured >= 1) {
    return { count: configured, source: "MCP_CLUSTER_WORKERS" };
  }
  return { count: Math.max(1, availableParallelism()), source: "availableParallelism()" };
}

/*
 * Shutdown, in one place, because a worker and a single-process run are the same
 * server and must not be able to describe a drain differently.
 *
 * close() stops the listener but waits for open connections, so a client holding
 * one keeps the process alive until something kills it - which under `docker stop`
 * is the runtime's SIGKILL after ten seconds, unlogged and uncountable. Measured
 * on this server's shape: a request in flight when close() is called completes
 * fine, but the close callback then waits out the keep-alive window - about 5.5s -
 * before it fires. With the drain below it fires at roughly 0.7s instead, which is
 * bounded rather than incidental.
 *
 * The trade is real and deliberate: a request still running when the window closes
 * is cut off. Every tool here reads one file out of content/ and returns it, so
 * 500ms is orders of magnitude more than a real call needs, and a caller that is
 * being cut off at 500ms was never going to get an answer anyway. A cluster changes
 * how many requests are in flight, not how long one takes, so the window is the same
 * one.
 */
const DRAIN_MS = 500;

/**
 * The worker: the process that actually answers.
 *
 * Every worker binds the same `port`. The kernel's shared handle and the round-robin
 * scheduler do the distribution - no SO_REUSEPORT is set by hand and no sticky session
 * logic is written, because the scheduler already has the information which connection
 * is next, and a sticky-session scheme would have to reconstruct it.
 */
function startWorker() {
  // A worker whose primary is gone holds the port for whoever starts next, and keeps
  // answering while it does. SIGKILL cannot be caught or forwarded, so the only signal
  // a killed primary sends is the IPC channel closing with it. Anything that stops the
  // primary outright - a crash, an operator, a supervisor, a test harness - would
  // otherwise leave a process serving a port no primary is watching.
  process.on("disconnect", () => process.exit(0));

  const httpServer = createApp().listen(port, host, () => {
    const allowList =
      hosts === null
        ? "Host allow-list is off - MCP_ALLOWED_HOSTS is unset"
        : `Host allow-list is ${hosts.join(", ")}`;

    process.stderr.write(
      `${SERVER_ID} ${version} serving over http on ${bind}:${port}/mcp - ${allowList}\n`
    );
  });

  /*
   * Each request is self-contained - a fresh McpServer, closed when its response
   * closes - so there is no session state to drain. What drains is the requests.
   */
  let draining = false;

  const shutdown = () => {
    // A second signal means the operator has stopped waiting.
    if (draining) process.exit(0);
    draining = true;

    process.stderr.write(`${SERVER_ID} draining for ${DRAIN_MS}ms before closing\n`);
    httpServer.close(() => process.exit(0));

    // unref'd, so this timer never holds the process open by itself. If every
    // connection closes before the window elapses, close()'s callback has already
    // exited and there is nothing left to wait for.
    setTimeout(() => httpServer.closeAllConnections(), DRAIN_MS).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/**
 * The primary: the process that forks workers and does not serve.
 *
 * It binds nothing, so the `serving over http` line is printed once per worker, and a
 * container's log describes ports that are genuinely open, from the processes that
 * opened them. A primary that printed a listening line of its own would be claiming a
 * port it does not hold.
 */
function startPrimary() {
  const { count, source } = workerCount();

  // Read by the respawn handler below, and set by the signal handler further down, so
  // it is declared before either can run rather than beside the one that reads it
  // first.
  let draining = false;

  if (count <= 1) {
    // No fork. The worker path is the whole server, and the line below is the only way
    // a reader of a single-process log learns that nothing was forked and why.
    process.stderr.write(
      `${SERVER_ID} ${version} ${source} is ${count}, so no worker is forked.\n`
    );
    startWorker();
    return;
  }

  process.stderr.write(
    `${SERVER_ID} ${version} forking ${count} HTTP workers on ${bind}:${port}/mcp\n`
  );

  // A worker that exits unexpectedly is replaced, but not forever: a server that
  // cannot start its workers is a server that should say so and stop, not one that
  // respawns into a crash loop nobody is watching.
  let starts = 0;

  cluster.on("exit", (worker, code, signal) => {
    if (draining) return;
    if (starts > count * 10) {
      process.stderr.write(
        `${SERVER_ID} ${version} a worker exited ${code ?? signal} ${starts} times, not restarting it.\n`
      );
      process.exit(1);
      return;
    }
    process.stderr.write(
      `${SERVER_ID} ${version} worker ${worker.process.pid} exited ${code ?? signal}, restarting it\n`
    );
    forkWorker();
  });

  function forkWorker() {
    starts += 1;
    cluster.fork();
  }

  for (let i = 0; i < count; i += 1) forkWorker();

  /*
   * Relay the signal, then wait.
   *
   * The signal goes to the workers rather than being handled here alone, because the
   * workers hold the requests and the listener. The primary exits when the last worker
   * is gone, so the port is genuinely closed before the process that started it is - a
   * test that stops the server and then checks the port is refused must not race a
   * primary that exits while its workers are still answering.
   */
  const shutdown = (signal) => {
    if (draining) {
      // A second signal means the operator has stopped waiting.
      process.exit(0);
    }
    draining = true;

    const workers = Object.values(cluster.workers ?? {}).filter(Boolean);
    process.stderr.write(
      `${SERVER_ID} ${version} ${signal}, draining ${workers.length} worker(s)\n`
    );

    // Unref'd: this timer is a backstop for a wedged worker, not a reason to keep the
    // process alive when every worker has already gone.
    const forced = setTimeout(() => process.exit(0), 10_000);
    forced.unref();

    let remaining = workers.length;
    for (const worker of workers) {
      worker.once("exit", () => {
        remaining -= 1;
        if (remaining === 0) {
          clearTimeout(forced);
          process.exit(0);
        }
      });
    }

    for (const worker of workers) worker.kill(signal);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (transportName === "http" || transportName === "streamable-http") {
  if (cluster.isPrimary) {
    startPrimary();
  } else {
    startWorker();
  }
} else {
  // stdio never forks. stdout is the JSON-RPC channel here, and a worker's copy of it
  // would corrupt the stream.
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
