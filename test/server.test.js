import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
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

const ORIGINAL_API_KEY = process.env.API_KEY;

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = ORIGINAL_API_KEY;
});

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

test("the four sample tools are registered", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "calculate_sum",
      "get_secure_summary",
      "get_server_time",
      "search_secure_data",
    ]);
  });
});

test("tools with a zod schema advertise their parameters", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    const sum = byName.get("calculate_sum").inputSchema;
    assert.deepEqual(Object.keys(sum.properties).sort(), ["a", "b"]);
    assert.equal(sum.properties.a.type, "number");
    assert.deepEqual(sum.required.sort(), ["a", "b"]);

    const search = byName.get("search_secure_data").inputSchema;
    assert.deepEqual(Object.keys(search.properties), ["query"]);
    assert.equal(search.properties.query.type, "string");
  });
});

test("tools without a schema advertise no parameters", async () => {
  await withClient(async ({ client }) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of ["get_server_time", "get_secure_summary"]) {
      const properties = byName.get(name).inputSchema.properties ?? {};
      assert.deepEqual(Object.keys(properties), [], `${name} takes no arguments`);
    }
  });
});

test("get_server_time returns a timestamp without an API key", async () => {
  delete process.env.API_KEY;

  await withClient(async ({ client }) => {
    const result = await client.callTool({ name: "get_server_time", arguments: {} });

    assert.notEqual(result.isError, true);
    assert.match(
      result.content[0].text,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });
});

test("calculate_sum adds its arguments without an API key", async () => {
  delete process.env.API_KEY;

  await withClient(async ({ client }) => {
    const result = await client.callTool({
      name: "calculate_sum",
      arguments: { a: 2, b: 40 },
    });

    assert.notEqual(result.isError, true);
    assert.equal(result.content[0].text, "42");
  });
});

test("calculate_sum rejects arguments of the wrong type", async () => {
  await withClient(async ({ client }) => {
    const result = await client.callTool({
      name: "calculate_sum",
      arguments: { a: "two", b: 40 },
    });

    assert.equal(result.isError, true);
  });
});

test("the authenticated tools fail descriptively with no API key", async () => {
  delete process.env.API_KEY;

  await withClient(async ({ client }) => {
    for (const [name, args] of [
      ["get_secure_summary", {}],
      ["search_secure_data", { query: "anything" }],
    ]) {
      const result = await client.callTool({ name, arguments: args });

      assert.equal(result.isError, true, `${name} must fail without a key`);
      assert.match(result.content[0].text, new RegExp(name));
      assert.match(result.content[0].text, /API_KEY/);
    }
  });
});

test("the authenticated tools succeed once the API key is set", async () => {
  process.env.API_KEY = "test-key-not-a-real-secret";

  await withClient(async ({ client }) => {
    const summary = await client.callTool({ name: "get_secure_summary", arguments: {} });
    assert.notEqual(summary.isError, true);
    assert.match(summary.content[0].text, /Authenticated/);

    const search = await client.callTool({
      name: "search_secure_data",
      arguments: { query: "widgets" },
    });
    assert.notEqual(search.isError, true);
    assert.match(search.content[0].text, /widgets/);
  });
});

test("the API key is never echoed back to the caller", async () => {
  process.env.API_KEY = "test-key-not-a-real-secret";

  await withClient(async ({ client }) => {
    for (const [name, args] of [
      ["get_secure_summary", {}],
      ["search_secure_data", { query: "widgets" }],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.doesNotMatch(JSON.stringify(result), /test-key-not-a-real-secret/);
    }
  });
});
