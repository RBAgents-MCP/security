---
name: secrets
description: One unified API key for the whole server - read it from process.env inside the handler, fail descriptively, and never log or echo it.
---

# Secrets

This server authenticates with **one unified key for the whole server**, not one key
per tool. It is read from `process.env.API_KEY`.

## Read it inside the handler, at call time

```js
export async function handler({ query }) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error(
      "search_secure_data requires an API key. Set the API_KEY environment variable " +
        "before starting the server."
    );
  }
  // ...
}
```

Never at module scope. A key captured at import time is the value that happened to be
set when the module was first loaded, which breaks three things at once: a process that
sets the key after startup, a test that sets and unsets it around a case, and an HTTP
server that builds a fresh `McpServer` per request but keeps the module cache.

## Registration never depends on the key

Every tool is registered whether or not a key is present. A server that hides its
authenticated tools when the key is missing reports "no such tool" to the caller -
which is indistinguishable from the tool not existing, and sends whoever is debugging
it looking in the wrong place entirely.

The tool is always listed; calling it without a key is what fails, and it fails saying
so.

## The failure must be descriptive

A missing key throws an `Error` naming the tool, the variable, and the fix. Not
`"unauthorized"`, not `"missing config"`, and never a silent empty result.

## Never disclose the key

* Do not log it, at any level, on any transport.
* Do not include it in tool output, an error message, or a health check response.
* Do not write it into a test fixture, a wiki page, or a commit.
* `.env` is gitignored and stays that way.

A test that needs a key sets `process.env.API_KEY` to an obvious dummy and restores the
previous value afterwards.
