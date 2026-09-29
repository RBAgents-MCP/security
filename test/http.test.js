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
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SERVER_ID, createServer } from "../src/server.js";

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

/** The text of a single-content tool result. */
function textOf(result) {
  assert.notEqual(result.isError, true, "expected a successful result");
  assert.equal(result.content.length, 1, "expected exactly one content block");
  return result.content[0].text;
}

/**
 * One tool call against a fresh server over a real socket.
 *
 * By name, with no arguments. The HTTP path is the surface a container is
 * published on, so the claim it has to carry is the one the tool list makes: every
 * file is a tool, and none of them takes anything.
 */
function call(client, name) {
  return client.callTool({ name, arguments: {} }).then(textOf);
}

/**
 * The same call, answered in memory rather than over the wire.
 *
 * The point of every comparison against this is that the transport must not be
 * able to change the answer.
 */
async function inMemoryAnswer(name) {
  const server = createServer({ version: "0.0.0" });
  const client = new Client({ name: "in-memory-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    return await call(client, name);
  } finally {
    await client.close();
    await server.close();
  }
}

/** POST a raw body to /mcp. */
function postRaw(port, payload, path = "/mcp") {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": payload.length },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            error: null,
          })
        );
      }
    );

    // A body past the size limit makes the server hang up mid-request, which is
    // a refusal too. Report that rather than failing on the transport.
    req.on("error", (error) => resolve({ status: null, body: "", error }));
    req.end(payload);
  });
}

const openServers = new Set();
const openClients = new Set();

after(async () => {
  // A client holds its connection for the life of the session, so a client
  // left open keeps the event loop alive and this file never exits. The race
  // covers a client whose server has already been killed, where close() hangs
  // on a socket nobody will ever answer.
  for (const client of openClients) {
    await Promise.race([
      client.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }

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

test("the HTTP transport serves the same tool surface as stdio", async () => {
  const server = await startServer();
  const client = await connect(server.port);

  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["roblox_security_index", "trust_boundaries", "zero_trust_networking"]
  );
});

test("a tool call over HTTP returns the file byte-identically", async () => {
  const server = await startServer();
  const client = await connect(server.port);

  const name = "zero_trust_networking";
  const overHttp = await call(client, name);

  // \r? because a checkout on Windows serves CRLF, and the bytes are served as
  // they are on disk.
  assert.match(overHttp, /^---\r?\n/, "frontmatter is part of the served text");
  assert.ok(overHttp.includes("name:"), "frontmatter is not stripped");

  assert.equal(overHttp, await inMemoryAnswer(name), "the transport must not change the answer");
});

test("a tool call over HTTP needs no key", async () => {
  delete process.env.API_KEY;

  const server = await startServer();
  const client = await connect(server.port);

  const text = await call(client, "trust_boundaries");
  assert.ok(text.length > 500, "the set is served without a key");
});

test("no tool accepts a write verb or a credential over HTTP either", async () => {
  const server = await startServer();
  const client = await connect(server.port);

  const { tools } = await client.listTools();

  for (const tool of tools) {
    const properties = Object.keys(tool.inputSchema.properties ?? {});

    for (const name of ["action", "verb", "operation", "command", "body", "content"]) {
      assert.equal(properties.includes(name), false, `${tool.name} must not accept ${name}`);
    }

    for (const name of ["apiKey", "api_key", "token", "secret", "password"]) {
      assert.equal(properties.includes(name), false, `${tool.name} must not accept ${name}`);
    }
  }
});

test("concurrent requests do not share state", async () => {
  const server = await startServer();
  const client = await connect(server.port);

  // The transport is stateless: a fresh McpServer is built per request and
  // closed with it. Hoisting one to module scope would leak per-connection state
  // between unrelated callers, and this is the failure that would cause.
  const [first, second] = await Promise.all([
    call(client, "zero_trust_networking"),
    call(client, "trust_boundaries"),
  ]);

  assert.notEqual(first, second, "each caller must get its own answer");

  assert.equal(first, await inMemoryAnswer("zero_trust_networking"));
  assert.equal(second, await inMemoryAnswer("trust_boundaries"));
});

test("a tool call over the wire cannot be steered by an argument", async () => {
  // The traversal payloads the old path-taking tool needed guards for, sent
  // against the new surface. There is no argument, so the only thing a caller can
  // change is the name - and a name that is not in the list is refused by the
  // server, not by a check in this repository's code. The real defence is that no
  // tool has an argument at all, which `no tool accepts a write verb or a
  // credential over HTTP either` and the in-memory no-argument test both assert.
  const server = await startServer();
  const client = await connect(server.port);

  for (const name of [
    "../../package.json",
    "../../../.git/config",
    "roblox/../../package.json",
    "/etc/passwd",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    // The decode step that only a real socket can reach. As a JSON string body
    // this arrives literally, never URL-decoded.
    "..%2f..%2fpackage.json",
  ]) {
    // A name that is not in the tool list is refused, and the SDK surfaces that
    // as a rejected call. Either way the assertion is the same one: nothing
    // outside `content/` comes back over the wire.
    const text = await client
      .callTool({ name, arguments: {} })
      .then(textOf)
      .catch(() => "");

    assert.doesNotMatch(text, /"name":/, `${name} must leak nothing`);
    assert.doesNotMatch(text, /\[core\]/, `${name} must leak nothing`);
  }

  // And an argument sent at a real tool is simply not there to be read.
  const withArgument = await client
    .callTool({ name: "zero_trust_networking", arguments: { path: "../../package.json" } })
    .then(textOf);
  const without = await call(client, "zero_trust_networking");

  assert.equal(withArgument, without, "an unexpected argument cannot change the answer");
});

test("an unknown route is refused", async () => {
  const server = await startServer();

  const { status, body } = await requestWithHost(server.port, "127.0.0.1", "/nope");

  assert.equal(status, 404);
  assert.match(body, /Not found: \/nope/, "the body names the path that was refused");
});

test("the process survives a bad request", async () => {
  const server = await startServer();

  const malformed = await postRaw(server.port, "{not json");
  assert.equal(malformed.status, 400);

  const wrongMethod = await requestWithHost(server.port, "127.0.0.1", "/mcp");
  assert.equal(wrongMethod.status, 405);

  const missingRoute = await requestWithHost(server.port, "127.0.0.1", "/nope");
  assert.equal(missingRoute.status, 404);

  assert.equal(server.child.exitCode, null, "the process must still be running");

  const client = await connect(server.port);
  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["roblox_security_index", "trust_boundaries", "zero_trust_networking"]
  );
});

test("a body over the limit is refused and the process survives", async () => {
  const server = await startServer();

  // readBody caps a body at 4 MiB, and an unauthenticated caller reaching an
  // open listener is the one place here that can be made to consume unbounded
  // memory. It is also the only guard in the HTTP path nothing asserts.
  //
  // The payload is deliberately valid JSON: without the size cap it would parse
  // cleanly and come back as a 200 carrying a JSON-RPC error, so a 400 here can
  // only have come from the cap. Sending malformed JSON instead would make the
  // refusal indistinguishable from an ordinary parse error.
  //
  // The `path` argument is one no tool declares, which is the point: the cap
  // fires in readBody, before the request ever reaches the tool layer, so it
  // holds however the body is shaped and whatever the surface accepts.
  const oversized = Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "zero_trust_networking", arguments: { path: "a".repeat(4 * 1024 * 1024) } },
    }),
    "utf8"
  );

  assert.ok(oversized.length > 4 * 1024 * 1024, "the payload has to exceed the cap");

  const refused = await postRaw(server.port, oversized);

  assert.equal(refused.status, 400, "an oversized body must be refused before it is parsed");
  assert.equal(server.child.exitCode, null, "the process must still be running");

  const client = await connect(server.port);
  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["roblox_security_index", "trust_boundaries", "zero_trust_networking"]
  );
});

test("the process exits on SIGTERM, draining first", async () => {
  const server = await startServer();

  // A client that has made a request and is now idle still holds its keep-alive
  // connection open. That is the case server.close() alone waits on forever.
  const client = await connect(server.port);
  await client.listTools();

  server.child.kill("SIGTERM");

  const { code, signal } = await new Promise((resolve) => {
    server.child.on("exit", (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  });

  assert.notEqual(code, 1, `the server failed on SIGTERM (${code ?? signal})`);

  // Windows has no signals. Node emulates them by terminating the target
  // unconditionally, so a handler registered here never runs and there is no
  // drain to observe - only the fact that the process stopped.
  if (process.platform !== "win32") {
    assert.equal(code, 0, "a signalled server should exit cleanly, not fail");
    assert.match(
      server.output.stderr,
      /draining for 500ms before closing/,
      "shutdown should drain before it closes"
    );
  }
});
