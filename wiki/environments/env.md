# Environment Variables

Three variables, all optional. The server starts with none of them set; only the tools
that require authentication fail in that state.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `API_KEY` | unset | Tool handlers | The single server-wide key. Tools that require it fail without it. |
| `MCP_TRANSPORT` | `stdio` | `src/index.js` | `stdio` or `http` (`streamable-http` is accepted too). |
| `PORT` | `3000` | `src/index.js` | The port the HTTP transport listens on. Ignored on stdio. |

## `API_KEY`

One key for the whole server, not one per tool.

```bash
export API_KEY="your-key-here"
npm start
```

Tools that need it read it **when they are called**, so setting it after the process
starts still works. Without it, those tools fail with a message naming the tool and the
variable:

```
get_secure_summary requires an API key. Set the API_KEY environment variable
before starting the server.
```

Tools that do not need it — `get_server_time`, `calculate_sum` in the shipped samples —
work with nothing configured.

Every tool is listed by `tools/list` whether or not a key is set. Only *calling* an
authenticated tool fails, which keeps "you are not authenticated" distinguishable from
"that tool does not exist".

### Keeping it out of the repository

`.env` is gitignored. The key is never logged, never included in tool output, and never
returned by `/healthz`. Do not paste it into a test fixture, a wiki page, or a commit.

## `MCP_TRANSPORT` and `PORT`

```bash
# stdio (default)
npm start

# streamable HTTP on 3000
npm run start:http

# streamable HTTP on another port
MCP_TRANSPORT=http PORT=8080 node src/index.js

# the same, through the CLI
template serve --http --port 8080
```

The CLI's `serve` command sets both variables from its flags, so `--http`, `--stdio`,
and `--port` are equivalent to exporting them.

## Related pages

* [`setup.md`](setup.md) — installing and running both modes.
* [`../information/overview.md`](../information/overview.md) — what the project is.
