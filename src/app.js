import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { SERVER_ID, createServer } from "./server.js";
import { version } from "./version.js";

/*
 * The HTTP transport, as an application.
 *
 * This module builds an express app and returns it. It does not listen - the entry
 * point owns the port, and after the cluster change also the worker count. A file
 * that both builds the app and binds a port cannot be reasoned about without
 * binding one, and test/http.test.js starts the real entry point as a real process
 * precisely so that the port and the process lifetime are real.
 *
 * The surface is deliberately narrow: POST /mcp and GET /healthz, a JSON-RPC 404
 * for everything else, and a 405 for any other method on /mcp. Nothing here is a
 * second source of truth about the tool list - createServer() is the same factory
 * the stdio transport uses, and it returns a fresh McpServer per call, so each
 * request gets its own.
 */

/**
 * The request body ceiling, in bytes.
 *
 * The previous implementation enforced this by counting chunks as they arrived and
 * throwing past the limit. The same number, declared rather than counted.
 */
export const BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * The accepted `Host` header values, or `null` when the guard is off.
 *
 * Unset means skipped, not guessed at. A wrong list silently refusing every
 * request is a worse failure than an absent one, so there is no default list
 * to fall back to - the caller reports the absence on stderr instead, because
 * silence is indistinguishable from a guard that is working.
 */
export function allowedHosts() {
  const configured = (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : null;
}

/**
 * A JSON-RPC error response.
 *
 * The shape every refusal on this server uses: the same envelope a client parses
 * for a successful response, so a client never has to branch on content type to
 * find out it was refused.
 */
function rpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Build the HTTP application.
 *
 * @returns {import("express").Express}
 */
export function createApp() {
  const app = express();

  // Express stamps `X-Powered-By: Express` on every response it sends, which hands
  // an unauthenticated caller the framework and the exact version serving the port
  // - a free upgrade suggestion, and a narrowing of what an attacker has to guess.
  // The header is removed here deliberately and this line is a security control, not
  // an omission: do not restore it because a route looks like it is missing a header.
  //
  // `disable` rather than `app.set` because this is a setting of the app itself and
  // it must hold for every response, including the ones no route here produces.
  app.disable("x-powered-by");

  // DNS-rebinding protection. A browser on a page the user is visiting can be pointed
  // at a loopback or container address, and neither this server nor anything in front
  // of it asks who is asking. The Host header is the only thing tying the request to a
  // deployment the operator chose, so when the operator names one, honour it.
  //
  // Mounted ahead of the body parser and ahead of every route, /healthz included: an
  // allow-list that guards /mcp and not /healthz is an allow-list with a hole in it.
  // Ahead of the body parser for a second reason - a request that is going to be
  // refused should never have its body read into memory first.
  //
  // Not mounted at all when there is no list, which is the default and is deliberate:
  // unset, empty, or separators-only means every request is served. A guard that
  // defaulted on would refuse everything, and a server that refuses everything looks
  // broken rather than misconfigured.
  //
  // This is the SDK's own middleware, mounted natively. It is Express-shaped - it
  // refuses by calling res.status(code).json(body) and hands on with next() - and
  // until now that meant this repository had to carry a hand-written Host parser
  // instead, because node:http has neither method. Express has both, so the second
  // implementation is gone rather than left in place with no caller.
  //
  // The port-agnostic matching and the JSON-RPC refusal body therefore have one
  // implementation, the one its own maintainers test.
  const hosts = allowedHosts();
  if (hosts !== null) {
    app.use(hostHeaderValidation(hosts));
  }

  app.use(express.json({ limit: BODY_LIMIT_BYTES }));

  /**
   * The health check. Answers without a session, a request, or a tool.
   */
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", server: SERVER_ID, version });
  });

  /**
   * The MCP endpoint.
   *
   * Stateless: a fresh McpServer and a fresh transport per request, with
   * sessionIdGenerator: undefined telling the transport not to mint one. There is
   * no session store to keep bounded, because there are no sessions.
   */
  app.post("/mcp", async (req, res) => {
    const server = createServer({ version });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Fires on disconnect as well as on a clean close, which is the case that leaks.
    // Closing both halves is what keeps a stateless transport stateless: a retained
    // McpServer per request would be a leak per request.
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) rpcError(res, 500, -32603, String(error));
    }
  });

  // Any other method on /mcp is refused rather than served. It is a refusal and not
  // a 404: the path exists, and saying so is more useful to a client than pretending
  // it does not.
  app.all("/mcp", (req, res) => {
    rpcError(res, 405, -32000, `${req.method} is not supported in stateless mode`);
  });

  // Anything else is not a route this server has. A 404 that says so is more useful
  // than a bare one, and it is the only place a request is answered with prose.
  app.use((req, res) => {
    rpcError(res, 404, -32601, `Not found: ${req.originalUrl}`);
  });

  /*
   * Errors the routes above did not answer.
   *
   * express.json reports an oversized body as `entity.too.large` and a malformed one
   * as `entity.parse.failed`. Both become the same 400 / -32700, because the previous
   * hand-rolled reader produced one answer for both: it threw the same failure
   * whichever way the request was wrong. Collapsing them is a deliberate
   * preservation, not an oversight.
   *
   * Registered last, and declared with four arguments, because that is how express
   * recognises an error handler rather than ordinary middleware.
   */
  app.use((error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error?.type === "entity.too.large" || error?.type === "entity.parse.failed") {
      rpcError(res, 400, -32700, "Parse error: request body is not valid JSON");
      return;
    }

    rpcError(res, 500, -32603, String(error?.message ?? error));
  });

  return app;
}
