import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SERVER_ID, createServer, listTools } from "../src/server.js";

/**
 * Connect an in-memory client to a fresh server and hand both to `run`,
 * closing them afterwards whether or not `run` throws.
 */
async function withClient(run) {
  const server = createServer({ version: "0.0.0" });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    return await run({ client, server });
  } finally {
    await client.close();
    await server.close();
  }
}

/** The text of a single-content tool result. */
function textOf(result) {
  assert.notEqual(result.isError, true, "expected a successful result");
  assert.equal(result.content.length, 1, "expected exactly one content block");
  return result.content[0].text;
}

/** The two Roblox security conventions, in the shape the index routes them by. */
const CONVENTIONS = [
  "roblox/security/zero-trust-networking.md",
  "roblox/security/trust-boundaries.md",
];

test("the CLI list and the MCP tool list agree", async () => {
  await withClient(async ({ client }) => {
    assert.equal(client.getServerVersion().name, SERVER_ID);

    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      listTools().map((tool) => tool.name).sort()
    );

    const described = new Map(listTools().map((tool) => [tool.name, tool.description]));
    for (const tool of tools) {
      assert.ok(tool.description, `${tool.name} needs a description`);
      assert.equal(tool.description, described.get(tool.name));
    }
  });
});

test("roblox_security_instruction is the only tool", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name), ["roblox_security_instruction"]);
  });
});

test("roblox_security_instruction advertises the path it takes", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();
    const tool = tools[0];

    assert.deepEqual(Object.keys(tool.inputSchema.properties), ["path"]);
    assert.equal(tool.inputSchema.properties.path.type, "string");
    assert.deepEqual(tool.inputSchema.required, ["path"]);
  });
});

test("roblox_security_instruction returns a convention from the set", async () => {
  await withClient(async ({ client }) => {
    const text = textOf(
      await client.callTool({
        name: "roblox_security_instruction",
        arguments: { path: "roblox/security/zero-trust-networking.md" },
      })
    );

    // \r? because a checkout on Windows serves CRLF, and the bytes are served as
    // they are on disk.
    assert.match(text, /^---\r?\n/, "frontmatter is part of the served text");
    assert.ok(text.includes("name:"), "frontmatter is not stripped");
  });
});

test("the index is reachable and routes the two files", async () => {
  await withClient(async ({ client }) => {
    const text = textOf(
      await client.callTool({
        name: "roblox_security_instruction",
        arguments: { path: "index/roblox-security-index.md" },
      })
    );

    for (const path of CONVENTIONS) {
      assert.ok(text.includes(path), `the index must route ${path}`);
    }
  });
});

test("both Roblox security conventions are served", async () => {
  await withClient(async ({ client }) => {
    for (const path of CONVENTIONS) {
      const text = textOf(
        await client.callTool({ name: "roblox_security_instruction", arguments: { path } })
      );
      assert.ok(text.length > 500, `${path} came back empty or truncated`);
    }
  });
});

test("a traversal attempt reports not found and leaks nothing", async () => {
  await withClient(async ({ client }) => {
    for (const path of [
      "../../package.json",
      "../../../.git/config",
      "roblox/../../package.json",
      "/etc/passwd",
      "C:\\Windows\\System32\\drivers\\etc\\hosts",
    ]) {
      const text = textOf(
        await client.callTool({ name: "roblox_security_instruction", arguments: { path } })
      );

      assert.match(text, /^not found:/, `${path} must be refused`);
      assert.doesNotMatch(text, /"name":/, `${path} must leak nothing`);
      assert.doesNotMatch(text, /\[core\]/, `${path} must leak nothing`);
    }
  });
});

test("an unknown path inside the set reports not found", async () => {
  await withClient(async ({ client }) => {
    const text = textOf(
      await client.callTool({
        name: "roblox_security_instruction",
        arguments: { path: "roblox/security/anti-cheat.md" },
      })
    );

    assert.match(text, /^not found: roblox\/security\/anti-cheat\.md/);
  });
});

test("the set root itself is not a file", async () => {
  await withClient(async ({ client }) => {
    const text = textOf(
      await client.callTool({
        name: "roblox_security_instruction",
        arguments: { path: "." },
      })
    );

    assert.match(text, /^not found:/);
  });
});

test("no tool accepts a write verb", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      for (const name of ["action", "verb", "operation", "command", "body", "content"]) {
        assert.equal(
          properties.includes(name),
          false,
          `${tool.name} must not accept ${name}`
        );
      }
    }
  });
});

test("no tool accepts a credential", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      for (const name of ["apiKey", "api_key", "token", "secret", "password"]) {
        assert.equal(
          properties.includes(name),
          false,
          `${tool.name} must not accept ${name}`
        );
      }
    }
  });
});

test("the server needs no key to answer", async () => {
  delete process.env.API_KEY;

  await withClient(async ({ client }) => {
    const text = textOf(
      await client.callTool({
        name: "roblox_security_instruction",
        arguments: { path: "roblox/security/trust-boundaries.md" },
      })
    );

    assert.ok(text.length > 500, "the set is served without a key");
  });
});
