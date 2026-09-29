import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CONTENT_DIR, TOOL_FILES } from "../src/tools/from-content.js";
import { SERVER_ID, TOOL_MODULES, createServer, listTools } from "../src/server.js";

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

/** Every markdown file in the served set, as [path-relative-to-content, absolute]. */
async function markdownFiles(dir = CONTENT_DIR) {
  const found = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(full)));
    else if (entry.name.endsWith(".md")) {
      found.push([relative(CONTENT_DIR, full).split(sep).join("/"), full]);
    }
  }

  return found.sort(([a], [b]) => a.localeCompare(b));
}

/** The two Roblox security conventions, in the shape the index routes them by. */
const CONVENTIONS = [
  "roblox/security/zero-trust-networking.md",
  "roblox/security/trust-boundaries.md",
];

// The two surfaces cannot drift apart.

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

// The surface is generated from content/. With a set this small the file list and
// the tool list can be checked by reading them side by side, and they are.

test("the tool list and the files on disk are a bijection", async () => {
  // Both directions, because each catches a different mistake. Files-to-tools
  // catches a file that was added to the set and never surfaced; tools-to-files
  // catches a tool serving something no longer in it. Together they are what makes
  // "add a file, get a tool" a property rather than a hope.
  const files = (await markdownFiles()).map(([path]) => path);
  const served = [...TOOL_FILES.values()].sort((a, b) => a.localeCompare(b));

  assert.deepEqual(served, files);

  assert.equal(
    TOOL_FILES.size,
    files.length,
    "two files must not derive the same tool name"
  );
  assert.ok(files.length > 0, `expected a real set, found ${files.length} files`);
});

test("every tool name is derived from its own filename", () => {
  // The derivation is the design: a file's name is what a caller reads in the
  // tool list, so it has to survive the trip. Folder dropped, `.md` dropped,
  // kebab to snake. There are no overrides in this repository, so every name
  // falls out of that rule.
  for (const [name, path] of TOOL_FILES) {
    const expected = path
      .split("/")
      .pop()
      .replace(/\.md$/, "")
      .toLowerCase()
      .replace(/-/g, "_");

    assert.equal(name, expected, `${path} derives ${name}, expected ${expected}`);
    assert.match(name, /^[a-z][a-z0-9_]{0,63}$/, `${name} is not a usable tool name`);
  }
});

test("every tool has a distinct name and a description to route on", () => {
  const names = TOOL_MODULES.map(({ config }) => config.name);
  assert.equal(new Set(names).size, names.length, "tool names must be unique");

  for (const { config } of TOOL_MODULES) {
    assert.ok(
      config.description && config.description.length > 0,
      `${config.name} needs a description`
    );
  }
});

test("no tool takes an argument", async () => {
  // The structural claim, and the replacement for the traversal defence the old
  // path-taking tool needed. With no argument there is nothing to traverse with,
  // so this is not a weaker version of the check that was deleted - it is the
  // check. It is a positive claim about the new surface, not a leftover.
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      assert.deepEqual(
        tool.inputSchema.properties ?? {},
        {},
        `${tool.name} must take no argument`
      );
      assert.deepEqual(
        tool.inputSchema.required ?? [],
        [],
        `${tool.name} must require nothing`
      );
    }
  });
});

test("every tool returns its own file, whole and with frontmatter", async () => {
  await withClient(async ({ client }) => {
    for (const [name, path] of TOOL_FILES) {
      const text = textOf(await client.callTool({ name, arguments: {} }));
      const onDisk = await readFile(join(CONTENT_DIR, path), "utf8");

      assert.equal(text, onDisk, `${name} must serve ${path} byte for byte`);

      // \r? because a checkout on Windows serves CRLF, and the bytes are served as
      // they are on disk.
      assert.match(text, /^---\r?\n/, `${name} must serve the frontmatter`);
      assert.ok(text.includes("name:"), `${name} must not strip the frontmatter`);
    }
  });
});

test("the whole set is served and nothing is served twice", async () => {
  // Served twice would mean a file the set holds that a caller cannot reach by
  // name; served short would mean a file silently dropped from the surface.
  await withClient(async ({ client }) => {
    let total = 0;
    for (const [name] of TOOL_FILES) {
      total += textOf(await client.callTool({ name, arguments: {} })).length;
    }

    let onDisk = 0;
    for (const [, full] of await markdownFiles()) {
      onDisk += (await readFile(full, "utf8")).length;
    }

    assert.equal(total, onDisk, "the tools must serve exactly the files on disk");
  });
});

test("the index is reachable and routes the two files", async () => {
  // The router test is kept deliberately. It is what forces the index to stay
  // complete as files are added, and with three tools the entry point is most of
  // what a client knows about this server.
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "roblox_security_index"));

    const text = textOf(
      await client.callTool({ name: "roblox_security_index", arguments: {} })
    );

    for (const path of CONVENTIONS) {
      assert.ok(text.includes(path), `the index must route ${path}`);
    }
  });
});

test("both Roblox security conventions are served whole", async () => {
  await withClient(async ({ client }) => {
    for (const path of CONVENTIONS) {
      const name = path
        .split("/")
        .pop()
        .replace(/\.md$/, "")
        .replace(/-/g, "_");

      const text = textOf(await client.callTool({ name, arguments: {} }));
      assert.ok(text.length > 500, `${name} came back empty or truncated`);
    }
  });
});

// The read-only claim, now over a surface with no arguments at all.

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
      await client.callTool({ name: "roblox_security_index", arguments: {} })
    );

    assert.ok(text.length > 500, "the set is served without a key");
  });
});

test("TOOL_MODULES is the whole surface, and every module is well formed", () => {
  // A tool registered outside this array would be invisible to listTools(), to the
  // CLI, and to the bijection above - so the count is asserted, not assumed.
  assert.equal(TOOL_MODULES.length, TOOL_FILES.size);

  for (const { config, handler } of TOOL_MODULES) {
    assert.equal(typeof config.name, "string");
    assert.ok(config.description.length > 0, `${config.name} needs a description`);
    assert.equal(config.schema, undefined, `${config.name} must not declare a schema`);
    assert.equal(typeof handler, "function");
  }
});
