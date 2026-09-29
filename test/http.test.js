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
import { connect as netConnect, createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BODY_LIMIT_BYTES } from "../src/app.js";
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
 *
 * The capture also spans the whole process tree, not just the process spawned
 * here. With `MCP_CLUSTER_WORKERS` above one, the child is a primary that
 * serves nothing and forks workers, and the workers inherit its stdout and
 * stderr - which is why a worker's startup line is visible here at all.
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

  /**
   * How many times `needle` has appeared so far.
   *
   * Not a boolean: with `MCP_CLUSTER_WORKERS=2` the startup line is printed once
   * per worker, and "the line appeared" cannot tell one worker from two. Counting
   * it is how this suite observes that a fork happened, without adding a pid to a
   * startup line that other tests pin as text.
   */
  const countOutput = (needle) => (output.stdout + output.stderr).split(needle).length - 1;

  /** Resolve true once `needle` has appeared `n` times, false if the deadline passes. */
  const waitForCount = (needle, n, timeout = 15_000) => {
    const deadline = Date.now() + timeout;

    return new Promise((resolve) => {
      const poll = () => {
        if (countOutput(needle) >= n) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        return setTimeout(poll, 25);
      };

      poll();
    });
  };

  /**
   * Resolve true once `needle` has appeared on stderr, false if the deadline passes.
   *
   * Separate from `waitForCount` because the primary's own lines are the ones worth
   * waiting for by name: a worker's startup line tells you a worker started, but
   * only the primary says which pid it lost.
   */
  const waitForStderr = (needle, timeout = 15_000) => {
    const deadline = Date.now() + timeout;

    return new Promise((resolve) => {
      const poll = () => {
        if (output.stderr.includes(needle)) return resolve(true);
        if (child.exitCode !== null) return resolve(false);
        if (Date.now() > deadline) return resolve(false);
        return setTimeout(poll, 25);
      };

      poll();
    });
  };

  return {
    child,
    port,
    output,
    url: `http://127.0.0.1:${port}`,
    countOutput,
    waitForCount,
    waitForStderr,
  };
}

/**
 * Start a server, hand it to `run`, and stop it afterwards whether or not
 * `run` throws.
 *
 * SIGKILL rather than the default SIGTERM, and the reason is the cluster: a
 * primary killed with a signal relays it to its workers and waits for them,
 * which is the behaviour under test elsewhere and merely slow here. A test that
 * fails should not also leave a drain running.
 */
async function withServer(env, run) {
  const server = await startServer(env);
  try {
    return await run(server);
  } finally {
    server.child.kill("SIGKILL");
  }
}

/**
 * Send a request carrying a specific `Host` header.
 *
 * `fetch` silently drops `Host` as a forbidden header name, so an allow-list
 * exercised through `fetch` would pass whatever the real control does. This
 * goes through `node:http`, which lets the header be set.
 *
 * The response headers come back too: `X-Powered-By` is the one a framework
 * adds whether or not any route asked for it, so it is asserted on the response
 * rather than on the app object.
 */
function requestWithHost(port, hostHeader, path = "/healthz") {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET", headers: { Host: hostHeader } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );

    req.on("error", reject);
    req.end();
  });
}

/**
 * Send a raw request line and nothing else, over a bare socket.
 *
 * `node:http` cannot produce this: it synthesises a `Host` header for every
 * HTTP/1.1 request, replaces an empty one with the address it dialled, and its
 * own parser answers a Host-less HTTP/1.1 request with a 400 before any
 * application code runs. A raw HTTP/1.0 line is the only way to put a request
 * in front of the guard that genuinely names no deployment.
 *
 * @param {number} port
 * @param {string} path
 * @param {string} version - the HTTP version to write on the request line
 */
function rawRequest(port, path, version) {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, "127.0.0.1", () => {
      socket.write(`GET ${path} ${version}\r\n\r\n`);
    });

    let raw = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      raw += chunk;
    });
    socket.on("end", () => {
      const split = raw.indexOf("\r\n\r\n");
      const [head, body = ""] =
        split === -1 ? [raw, ""] : [raw.slice(0, split), raw.slice(split + 4)];
      const status = Number.parseInt(head.split(" ")[1] ?? "", 10);
      resolve({ status: Number.isNaN(status) ? null : status, body });
    });
    socket.on("error", reject);
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
  // The SDK middleware's own message, not a hand-rolled one. The status and the
  // JSON-RPC code are what a client branches on and both are unchanged; the
  // message is named here so that swapping the guard for the SDK's is visible
  // in the diff rather than silent.
  assert.match(refused.body, /Invalid Host: evil\.example\.com/);
  assert.equal(JSON.parse(refused.body).error.code, -32000);

  // The /mcp endpoint is guarded by the same check as the health check, so a
  // rebinding attack cannot reach the tools by asking for the other path.
  const refusedMcp = await requestWithHost(server.port, "evil.example.com", "/mcp");
  assert.equal(refusedMcp.status, 403);
});

test("a request with no Host header at all is refused", async () => {
  // Refused today by the hand-rolled guard, and refused after the convergence by
  // the SDK's. It has to stay refused: a request that names no deployment is not
  // tied to any of them, so an allow-list that waves it through is not an
  // allow-list.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "security.example.com" });

  // HTTP/1.0, because that is the only shape that reaches the guard with no Host
  // on it. Over HTTP/1.1 the request never gets that far - see the test below.
  const refused = await rawRequest(server.port, "/healthz", "HTTP/1.0");
  assert.equal(refused.status, 403);
  assert.match(refused.body, /Missing Host header/);
  assert.equal(JSON.parse(refused.body).error.code, -32000);
});

test("a Host-less HTTP/1.1 request is refused by the parser before the guard sees it", async () => {
  // Recorded because it is the shape most readers will assume the test above is
  // exercising. It is not: Node's HTTP/1.1 parser requires the header and
  // answers a request without one with its own 400, before express, before the
  // guard, before anything in this repository runs. The result is still a
  // refusal, and it is still not a JSON-RPC envelope, so it is asserted as what
  // it is rather than folded into the case above.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "security.example.com" });

  const refused = await rawRequest(server.port, "/healthz", "HTTP/1.1");
  assert.equal(refused.status, 400);
  assert.doesNotMatch(refused.body, /Missing Host header/);
});

test("an unparseable Host header is refused, and named separately", async () => {
  // A third outcome, distinct from both of the above. The hand-rolled parser had
  // none: an unparseable header fell through to the not-allowed branch. The SDK
  // refuses it on its own terms, and the status is the same 403 either way -
  // which is the property that makes this convergence safe for a client.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "security.example.com" });

  const refused = await requestWithHost(server.port, "not a host");
  assert.equal(refused.status, 403);
  assert.match(refused.body, /Invalid Host header: not a host/);
  assert.equal(JSON.parse(refused.body).error.code, -32000);
});

test("a bracketed IPv6 Host matches when the list names it that way", async () => {
  // `[::1]` is the form the header actually carries, and the form the SDK's
  // parser returns, so a list that writes it is the only one that works. Getting
  // this wrong fails closed - the health check of a container bound to ::1 would
  // be refused by its own allow-list - so it is asserted rather than assumed.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "[::1]" });

  assert.equal((await requestWithHost(server.port, "[::1]")).status, 200);
  assert.equal((await requestWithHost(server.port, "[::1]:8080")).status, 200);
  assert.equal((await requestWithHost(server.port, "::1")).status, 403);
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

test("an empty or separators-only allow-list is the guard being off, not allow-nothing", async () => {
  // Three forms of the same state, all of them the default an operator reaches by
  // accident: never set it, set it to nothing, or set it to commas and spaces
  // because the variable exists and a deployment template filled it in.
  //
  // All three must serve every host and all three must say so on startup. The
  // failure this guards against is the one that looks like a security control
  // working: a list that trims to nothing but is still treated as a list refuses
  // every request, and the deployment reads as broken rather than misconfigured.
  for (const value of [undefined, "", " , , "]) {
    const server = await startServer(
      value === undefined ? {} : { MCP_ALLOWED_HOSTS: value }
    );

    assert.match(
      server.output.stderr,
      /allow-list is off - MCP_ALLOWED_HOSTS is unset/,
      `MCP_ALLOWED_HOSTS=${JSON.stringify(value)} must be reported as unset`
    );

    // Served, not refused: a host nobody named is still answered, because no
    // list is installed to have an opinion about it.
    assert.equal(
      (await requestWithHost(server.port, "anything.example.com")).status,
      200,
      `MCP_ALLOWED_HOSTS=${JSON.stringify(value)} must not install a list`
    );
    assert.equal(
      (await requestWithHost(server.port, "evil.example.com", "/mcp")).status,
      405,
      `MCP_ALLOWED_HOSTS=${JSON.stringify(value)} must reach the route table`
    );

    server.child.kill("SIGKILL");
  }
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

  // The body parser caps a body at 4 MiB, and an unauthenticated caller reaching
  // an open listener is the one place here that can be made to consume unbounded
  // memory. It is also the only guard in the HTTP path nothing asserts.
  //
  // The payload is deliberately valid JSON: without the size cap it would parse
  // cleanly and come back as a 200 carrying a JSON-RPC error, so a 400 here can
  // only have come from the cap. Sending malformed JSON instead would make the
  // refusal indistinguishable from an ordinary parse error.
  //
  // The `path` argument is one no tool declares, which is the point: the cap
  // fires in the body parser, before the request ever reaches the tool layer, so
  // it holds however the body is shaped and whatever the surface accepts.
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
  // The same answer an oversized body and a malformed one have always shared. The
  // hand-rolled reader threw one failure for both, so a client that learned to
  // expect -32700 on a malformed body was never taught anything else for a large
  // one; splitting the two would be a behaviour change nobody asked for.
  assert.equal(JSON.parse(refused.body).error.code, -32700);
  assert.equal(server.child.exitCode, null, "the process must still be running");

  const client = await connect(server.port);
  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["roblox_security_index", "trust_boundaries", "zero_trust_networking"]
  );
});

/* -------------------------------------------------------------------------- *
 * The body limit, and the framework that replaced the reader.
 * -------------------------------------------------------------------------- */

test("the body limit is the 4 MB it was before express", () => {
  // Pinned as a number, not just as a relation to whatever the constant now says. A
  // limit that quietly became 64 MB would keep every boundary test in this file
  // passing, and the number is a documented property of the transport rather than
  // an implementation detail.
  assert.equal(BODY_LIMIT_BYTES, 4 * 1024 * 1024);
});

test("malformed JSON gets exactly the same answer as a body that is too large", async () => {
  // Not tidiness. The hand-rolled reader this replaced threw one failure for both
  // cases, so a client was never taught to expect anything different for the
  // second. The two paths through express are genuinely different - `entity.parse
  // .failed` and `entity.too.large` - and the error handler collapses them on
  // purpose, which is a claim about them that only a test can hold.
  const server = await startServer();

  const malformed = await postRaw(server.port, "{ this is not json");
  const oversized = await postRaw(
    server.port,
    Buffer.from(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { padding: "x".repeat(BODY_LIMIT_BYTES) },
      }),
      "utf8"
    )
  );

  for (const [what, response] of [
    ["a malformed body", malformed],
    ["an oversized body", oversized],
  ]) {
    assert.equal(response.status, 400, `${what} must be refused`);
    assert.equal(JSON.parse(response.body).jsonrpc, "2.0", `${what} must answer in the envelope`);
    assert.equal(JSON.parse(response.body).error.code, -32700, `${what} must answer -32700`);
    assert.equal(
      JSON.parse(response.body).error.message,
      "Parse error: request body is not valid JSON",
      `${what} must give the same message`
    );
  }
});

test("no response advertises that the server is running express", async () => {
  const server = await startServer();

  // Checked on a served route, on the catch-all and on the 405, because the 404
  // and the 405 are produced by middleware rather than by a route and could
  // plausibly have taken a different path through the stack. `X-Powered-By` hands
  // an unauthenticated caller the framework and its version, which is a free
  // upgrade suggestion.
  const responses = await Promise.all([
    requestWithHost(server.port, "127.0.0.1", "/healthz"),
    requestWithHost(server.port, "127.0.0.1", "/nope"),
    requestWithHost(server.port, "127.0.0.1", "/mcp"),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 404, 405],
    "the three responses are the ones being checked for a header"
  );

  for (const response of responses) {
    assert.equal(
      response.headers["x-powered-by"],
      undefined,
      `X-Powered-By leaked on a ${response.status}`
    );
  }
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

/* -------------------------------------------------------------------------- *
 * The workers.
 *
 * Every one of these starts the real entry point as a real primary and talks to
 * it over the wire, because the thing under test is a property of *processes* -
 * that two of them can hold one port, that killing one leaves the others
 * listening to nothing - and none of it is observable from inside a single
 * process.
 * -------------------------------------------------------------------------- */

test("MCP_CLUSTER_WORKERS=1 forks nothing and serves on its own", async () => {
  await withServer({ MCP_CLUSTER_WORKERS: "1" }, async ({ output, countOutput, port }) => {
    assert.match(output.stderr, /MCP_CLUSTER_WORKERS is 1, so no worker is forked/);
    assert.doesNotMatch(output.stderr, /forking \d+ HTTP workers/);
    assert.equal(countOutput("serving over http"), 1, "one process, one startup line");

    // Still a working server: disabling the fork must not disable the transport.
    const client = await connect(port);
    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      ["roblox_security_index", "trust_boundaries", "zero_trust_networking"]
    );
  });
});

test("MCP_CLUSTER_WORKERS=2 binds the port from two separate workers", async () => {
  await withServer(
    { MCP_CLUSTER_WORKERS: "2" },
    async ({ output, countOutput, waitForCount, url }) => {
      assert.match(output.stderr, /forking 2 HTTP workers on 127\.0\.0\.1:\d+\/mcp/);

      // Two startup lines means two processes each bound the port - which only
      // happens through the cluster's shared handle, because two independent
      // `listen` calls on one port would be EADDRINUSE. This is the assertion
      // that the fork is real.
      assert.ok(
        await waitForCount("serving over http", 2),
        `expected two workers to bind, saw ${countOutput("serving over http")}\n${output.stderr}`
      );

      // And both are answering: enough concurrent requests to outlast a
      // single-process accept loop, each on its own connection.
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => fetch(`${url}/healthz`))
      );
      for (const response of responses) {
        assert.equal(response.status, 200);
        assert.equal((await response.json()).server, SERVER_ID);
      }
    }
  );
});

test("concurrent tool calls stay isolated when they cross a process boundary", async () => {
  // The property `cluster` can plausibly break. Each request builds its own
  // McpServer in whichever worker wins the connection, so three callers asking
  // for three different files must each get their own - and the workers are
  // separate processes, so anything cached at module scope has to hold in two
  // of them to pass.
  await withServer({ MCP_CLUSTER_WORKERS: "2" }, async ({ waitForCount, port }) => {
    assert.ok(await waitForCount("serving over http", 2), "the fork did not happen");

    const names = ["roblox_security_index", "trust_boundaries", "zero_trust_networking"];
    const clients = await Promise.all(names.map(() => connect(port)));

    try {
      const results = await Promise.all(
        clients.map((client, i) => client.callTool({ name: names[i], arguments: {} }))
      );

      const texts = results.map(textOf);
      for (const [i, text] of texts.entries()) {
        assert.ok(text.length > 500, `${names[i]} came back empty`);
        // Byte-identical to the in-memory answer for the same tool. That is a
        // stronger claim than "the right file came back": anything a worker did
        // to the answer on its way through a second process - a cache, a shared
        // module, a torn read - moves these bytes.
        assert.equal(text, await inMemoryAnswer(names[i]), `${names[i]} was answered with the wrong file`);
      }

      assert.equal(new Set(texts).size, names.length, "each caller got its own answer");
    } finally {
      await Promise.all(clients.map((client) => client.close()));
    }
  });
});

test(
  "no worker outlives a primary that was killed outright",
  // The failure this catches does not show up in this run. A worker whose primary
  // is gone keeps the port and keeps answering, so the suite passes, and then the
  // *next* run fails on EADDRINUSE against a process nobody remembers starting.
  // `after()` kills the primary with a signal on every failing run, so without
  // the `disconnect` handler this file would leak two processes per failed run.
  { skip: process.platform === "win32" ? "no signal delivery on Windows" : false },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });

    try {
      assert.ok(await server.waitForCount("serving over http", 2), "the fork did not happen");

      const exited = new Promise((resolve) => server.child.once("exit", resolve));

      // SIGKILL cannot be caught, handled, or forwarded. The primary leaves
      // instantly and the workers are told only through the IPC channel that
      // closes with it.
      server.child.kill("SIGKILL");
      await exited;

      // A worker takes a moment to notice the disconnect and exit. The generous
      // window is the point: a check that ran immediately would pass even when
      // the handler is missing, because the orphan has not finished dying yet.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // The proof, in two parts. The port stops answering...
      await assert.rejects(
        fetch(`${server.url}/healthz`),
        `the port is still served after the primary died - port ${server.port} has an orphan`
      );

      // ...and it is genuinely free, which a request that merely timed out would
      // not show: something else can bind it again.
      const rebound = createNetServer();
      try {
        await new Promise((resolve, reject) => {
          rebound.on("error", reject);
          rebound.listen(server.port, "127.0.0.1", resolve);
        });
      } finally {
        await new Promise((resolve) => rebound.close(resolve));
      }
    } finally {
      server.child.kill("SIGKILL");
    }
  }
);

test(
  "the cluster drains on SIGINT and exits 0",
  { skip: process.platform === "win32" ? "no signal delivery on Windows" : false },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });

    try {
      assert.ok(await server.waitForCount("serving over http", 2), "the fork did not happen");

      const exited = new Promise((resolve) =>
        server.child.once("exit", (code, signal) => resolve({ code, signal }))
      );
      server.child.kill("SIGINT");
      const { code, signal } = await exited;

      assert.equal(code, 0, `the primary did not exit cleanly: signal ${signal}`);

      // The primary says it is draining its workers, and each worker says it is
      // draining itself. Both lines, because the primary relays the signal rather
      // than killing its workers outright - a worker killed mid-request would drop
      // a response the client is still reading.
      assert.match(server.output.stderr, /SIGINT, draining 2 worker\(s\)/);
      assert.equal(
        server.countOutput("draining for 500ms before closing"),
        2,
        "both workers should report their own drain"
      );

      // And the port is genuinely closed once the primary is gone, which is the
      // ordering the wait-for-the-last-worker exists to guarantee.
      await assert.rejects(
        fetch(`${server.url}/healthz`),
        "the port is still served after the primary exited"
      );
    } finally {
      server.child.kill("SIGKILL");
    }
  }
);

test(
  "a second signal stops the wait rather than queueing behind the first",
  { skip: process.platform === "win32" ? "no signal delivery on Windows" : false },
  async () => {
    await withServer({ MCP_CLUSTER_WORKERS: "2" }, async ({ child, output, waitForCount }) => {
      assert.ok(await waitForCount("serving over http", 2), "the fork did not happen");

      const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));

      child.kill("SIGINT");
      child.kill("SIGINT");

      const code = await exited;
      assert.equal(code, 0);

      // What is asserted is the *observable* half of the early-exit path: the
      // primary's drain line is written once. A second signal that fell through to
      // the full drain would print it again, and the guarded flag in `startPrimary`
      // is what stops that. The suite cannot force a worker to be slow enough to
      // make the second signal land mid-drain, so the timing the branch exists for
      // - an operator who has stopped waiting - is not exercised here.
      assert.equal(output.stderr.split("SIGINT, draining ").length - 1, 1);
    });
  }
);

test("stdio forks nothing, because a worker's stdout would corrupt the stream", async () => {
  // Not observable through `startServer`, which waits for an HTTP startup line
  // that stdio never prints. Driven through the SDK's own stdio client instead,
  // so this is the real entry point over a real pipe - the assertion is that the
  // tool list comes back intact, not that a log happens to be quiet.
  const client = new Client({ name: "stdio-cluster-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    cwd: ROOT,
    env: { ...process.env, MCP_TRANSPORT: "stdio" },
    stderr: "pipe",
  });

  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    assert.equal(tools.length, 3, "one tool per file in the set");
    assert.ok(textOf(await client.callTool({ name: "trust_boundaries", arguments: {} })).length > 0);

    // The fork is the thing being ruled out, so it is asserted rather than
    // assumed. The handshake above already implies it - a forked worker writing
    // its startup line to the inherited stdout would have corrupted the stream
    // before the initialize response arrived.
    assert.match(stderr, /serving over stdio/);
    assert.doesNotMatch(stderr, /forking \d+ HTTP workers/);
  } finally {
    await client.close();
  }
});

test(
  "a worker that dies is replaced, and the server keeps serving",
  // The suite knows the primary's pid - it spawned it - but not its workers' pids:
  // the startup line is pinned by other tests and adding a pid to it, or to the
  // health check, would change a surface this task was not asked to change. So the
  // pids are read from the kernel instead, which is the one source that knows them
  // and is Linux only. Elsewhere this stays unchecked rather than being asserted
  // by a weaker proxy.
  { skip: process.platform === "linux" ? false : "worker pids are read from /proc" },
  async () => {
    const { readFile } = await import("node:fs/promises");

    /**
     * The direct children of `pid`, from `/proc`.
     *
     * `children` lives under the thread directory rather than the process one,
     * which is the shape the kernel has and the shape every tool on Linux expects.
     */
    const childrenOf = async (pid) => {
      const listed = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
      return listed.split(/\s+/).filter(Boolean).map(Number);
    };

    await withServer(
      { MCP_CLUSTER_WORKERS: "2" },
      async ({ child, output, waitForCount, waitForStderr, url }) => {
        assert.ok(await waitForCount("serving over http", 2), "the fork did not happen");

        const workers = await childrenOf(child.pid);
        assert.equal(workers.length, 2, `expected two workers, found ${workers.join(", ")}`);

        // `process.kill`, not `child.kill`: the latter takes a signal and nothing
        // else, so passing a pid as a second argument silently kills the *primary*
        // instead - which looks like a server that ignores its workers dying.
        process.kill(workers[0], "SIGKILL");

        // The replacement is a new pid, not the old one coming back, and the
        // primary says so out loud rather than silently refilling the pool.
        assert.ok(
          await waitForStderr(`worker ${workers[0]} exited`),
          `the primary did not report the death\n${output.stderr}`
        );
        assert.ok(await waitForCount("serving over http", 3), "the replacement did not bind");

        const after = await childrenOf(child.pid);
        assert.equal(after.length, 2, "the pool is back to two");
        assert.ok(!after.includes(workers[0]), "a dead pid is not back");
        assert.ok(after.includes(workers[1]), "the surviving worker was left alone");

        // And the server is still answering, on the pool it has now.
        assert.equal((await fetch(`${url}/healthz`)).status, 200);
      }
    );
  }
);
