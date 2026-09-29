/*
 * The HTTP transport, over a real socket.
 *
 * `server.test.js` links a client and a server through InMemoryTransport and
 * never opens a socket, so the HTTP path could be broken, or absent, and every
 * test in it would still pass. This suite starts the real entry point as a real
 * process and talks to it over the wire.
 */

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SERVER_ID } from "../src/server.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "src", "index.js");

/** A port nothing is listening on, so two test files never collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Resolve once the child's output matches `pattern`.
 *
 * Polling the captured text rather than waiting a fixed interval: a fixed
 * interval tests pipe timing, not the server. This way the assertion is about
 * the server having said the thing, whenever it took to say it.
 */
function waitForOutput(child, output, pattern, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    const poll = () => {
      const text = output.stdout + output.stderr;
      if (pattern.test(text)) return resolve(text);
      if (child.exitCode !== null) {
        return reject(new Error(`server exited with ${child.exitCode} before it was ready.\n${text}`));
      }
      if (Date.now() > deadline) {
        return reject(new Error(`server never reported ready.\n${text}`));
      }
      return setTimeout(poll, 25);
    };

    poll();
  });
}

/**
 * Start `src/index.js` as a real process on a free port.
 *
 * Both stdout and stderr are captured, because which stream a message arrives
 * on is itself under test: on this transport stdout is not a channel, and a
 * server that logged there would be a bug that only shows up under stdio.
 */
async function startServer(env = {}) {
  const port = await freePort();

  const child = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      MCP_TRANSPORT: "http",
      PORT: String(port),
      HOST: "127.0.0.1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
  });

  openServers.add(child);

  await waitForOutput(child, output, /serving over http/);

  return { child, port, output };
}

/**
 * Send a request carrying a specific `Host` header.
 *
 * `fetch` silently drops `Host` as a forbidden header name, so an allow-list
 * exercised through `fetch` would pass whatever the real control does. This
 * goes through `node:http`, which lets the header be set.
 */
function requestWithHost(port, hostHeader, path = "/healthz") {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET", headers: { Host: hostHeader } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );

    req.on("error", reject);
    req.end();
  });
}

/** A connected client, tracked so the file can close it at the end. */
async function connect(port) {
  const client = new Client({ name: "http-test-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));

  await client.connect(transport);
  openClients.add(client);

  return client;
}

const openServers = new Set();
const openClients = new Set();

after(async () => {
  // A client holds its connection for the life of the session, so a client
  // left open keeps the event loop alive and this file never exits.
  for (const client of openClients) await client.close().catch(() => {});

  for (const child of openServers) child.kill();
});

test("the Host allow-list refuses a host that is not on it", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "security.example.com" });

  const refused = await requestWithHost(server.port, "evil.example.com");
  assert.equal(refused.status, 403);
  assert.match(refused.body, /Host not allowed/);

  // The /mcp endpoint is guarded by the same check as the health check, so a
  // rebinding attack cannot reach the tools by asking for the other path.
  const refusedMcp = await requestWithHost(server.port, "evil.example.com", "/mcp");
  assert.equal(refusedMcp.status, 403);
});

test("an allowed host is served, and the port is not part of the match", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "127.0.0.1" });

  // With the port the client actually reached the server on.
  const withPort = await requestWithHost(server.port, `127.0.0.1:${server.port}`);
  assert.equal(withPort.status, 200);

  // And with no port at all. A proxy, a load balancer, and a container port
  // mapping each present a different port for the same server, so an
  // allow-list that matched the whole header would break the moment the one in
  // front of it changed.
  const withoutPort = await requestWithHost(server.port, "127.0.0.1");
  assert.equal(withoutPort.status, 200);
});

test("the allow-list holds several hosts and ignores surrounding space", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: " 127.0.0.1 , security.example.com " });

  assert.equal((await requestWithHost(server.port, "security.example.com")).status, 200);
  assert.equal((await requestWithHost(server.port, "127.0.0.1")).status, 200);
  assert.equal((await requestWithHost(server.port, "other.example.com")).status, 403);
});

test("the startup line says when the Host allow-list is off", async () => {
  const unset = await startServer();
  assert.match(unset.output.stderr, /allow-list is off/);

  const set = await startServer({ MCP_ALLOWED_HOSTS: "127.0.0.1" });
  // Both halves matter. A warning printed unconditionally would make the first
  // assertion pass for a server warning about nothing.
  assert.doesNotMatch(set.output.stderr, /allow-list is off/);
  assert.match(set.output.stderr, /allow-list is 127\.0\.0\.1/);
});

test("the HTTP server logs to stderr and never to stdout", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "127.0.0.1" });

  assert.match(server.output.stderr, /serving over http/);
  assert.equal(server.output.stdout, "", "stdout must stay empty on the server path");
});

test("the health check reports the server it is", async () => {
  const server = await startServer();

  const { status, body } = await requestWithHost(server.port, "127.0.0.1");
  assert.equal(status, 200);

  const health = JSON.parse(body);
  assert.equal(health.status, "ok");
  assert.equal(health.server, SERVER_ID);
});

test("the HTTP transport serves the same single tool as stdio", async () => {
  const server = await startServer();
  const client = await connect(server.port);

  const { tools } = await client.listTools();

  assert.deepEqual(tools.map((tool) => tool.name), ["roblox_security_instruction"]);
});
