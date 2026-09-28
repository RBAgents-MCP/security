# Project Scaffolding Prompt

You are acting as a scaffolding agent. This repository is a template for a dual-purpose MCP server and CLI. When the user initiates the scaffolding process, follow these steps strictly.

## Step 1: Gather Requirements
Ask the user for the following information in a single, clear message. Do not proceed to modify files until you have gathered all necessary details (or the user explicitly tells you to use defaults).

1. **Project Name** (e.g., `@my-org/my-mcp-server`)
2. **Project Description** (A short, one-line description)
3. **Repository URL** (e.g., `https://github.com/my-org/my-mcp-server` - note: always assume github.com and gitlab.com refer to the cloud-hosted providers)
4. **Organization / Author Name**
5. **CLI Command Name** (e.g., `my-cli` - defaults to the project name without scope)
6. **MCP Server ID** (e.g., `my-mcp-server` - defaults to the CLI command name)
7. **License** (e.g., MIT, Apache-2.0 - defaults to MIT)
8. **Initial Version** (e.g., `0.1.0`)

## Step 2: Confirmation
Once the user provides the details, summarize the values you will use and ask for a final confirmation before modifying any files.

## Step 3: Execute Scaffolding
Upon confirmation, perform the following actions:
1. **Update `package.json`**:
   - Update `name`, `version`, `description`, `author`, `license`.
   - Update `repository.url`.
   - Update the `bin` object keys to match the new **CLI Command Name** and **MCP Server ID** (e.g., `<cli-name>-server`).
2. **Update `README.md`**:
   - Replace the title, description, and repository details.
   - Update the quick start and installation commands to use the new package name and CLI command.
   - Remove the "Sample tools" table and the "Scaffolding a new project" section. Replace
     the table with a one-line mention of the `ping` tool created in step 3.
3. **Reset the tool layer** (`src/tools/` and `src/server.js`):

   The template ships four sample tools that exist only to demonstrate what the tool
   layer can do. A new project must not inherit them.

   a. **Delete all four sample tool files:**

   ```bash
   rm src/tools/get_server_time.js \
      src/tools/get_secure_summary.js \
      src/tools/calculate_sum.js \
      src/tools/search_secure_data.js
   ```

   b. **Create a single basic `src/tools/ping.js`** as the new project's starting point.
   It takes no arguments and requires no API key:

   ```js
   /*
    * The starting tool. Replace it with the project's own.
    */

   export const config = {
     name: "ping",
     description: "Return pong, to prove the server is reachable. Takes no arguments.",
   };

   export async function handler() {
     return {
       content: [{ type: "text", text: "pong" }],
     };
   }

   export default { config, handler };
   ```

   c. **Modify `src/server.js` to import and register only `ping`.** Delete the four
   sample imports and replace the `TOOL_MODULES` array so it holds `ping` alone:

   ```js
   import ping from "./tools/ping.js";

   const TOOL_MODULES = Object.freeze([ping]);
   ```

   Leave `listTools()` and `createServer()` as they are. The registration loop already
   handles both the schema and the no-schema form, so a later tool that declares a zod
   schema needs no change here — only a new file and a new entry in the array.

   d. **Update `test/server.test.js`** so the suite passes against the single `ping`
   tool. The template's tests assert the four sample names, their zod schemas, and the
   `API_KEY` behaviour; all of that is gone. Keep the surface-parity test — it is what
   holds the CLI and the MCP server together — and keep a test that calls `ping` and
   asserts it returns `pong`. Delete the rest.

   e. **Run `npm test`** and confirm it passes before continuing. A scaffolded project
   whose suite is red on the first commit is the failure this step exists to prevent.
4. **Update `src/server.js` identity**:
   - Update `SERVER_ID` and `SERVER_TITLE` to match the new project.
5. **Update `src/cli.js`**:
   - Update the `HELP` text to use the new CLI command name and description.
   - Drop the `API_KEY` line from the `Environment` block unless the new project actually
     uses a server-wide key.
6. **Update `wiki/environments/setup.md`**:
   - Replace all references of the old template names with the new project names.
   - Replace the sample `tools` output with the `ping` row.
   - Remove the "Authentication" section unless the new project uses `API_KEY`.
7. **Update the rest of the documentation**:
   - `wiki/information/overview.md`: remove the sample tool table and the template
     framing; describe the new project.
   - `wiki/information/architecture.md`: keep the structure, but replace the
     `calculate_sum` example with `ping` and drop the authentication section if unused.
   - `wiki/environments/env.md`: remove `API_KEY` unless the new project uses it.
8. **Update `AGENTS.md`**:
   - **Keep the "Shared Instruction Set" section and the trigger table exactly as they
     are.** Every consuming repository carries that bootstrap block verbatim, and the
     table is mirrored row-for-row from `agents://rules/auto-activation.md` — this is
     the mechanism by which the new project resolves the shared set at all. Deleting
     either leaves a repository whose conventions never activate.
   - Remove the "Project Scaffolding (Template Mode)" section, and the
     `Scaffold a new project from this template` row from the trigger table, as the
     repository is no longer a template.
   - Remove the `Change the sample tools, PROMPT.md, or anything a scaffolded project
     inherits` row — the local rule it points at is deleted in step 9. Keep the
     `tool-authoring` and `secrets` rows if those rules are kept.
   - Append rows to the trigger table for any local instruction the new project adds
     under `.agents/`. Never remove, reorder, or repoint a mirrored row — repointing is
     an override and is declared in `.agents/index/root-index.md`.
   - Update the description in the frontmatter.
9. **Update the local instruction set** (`.agents/`):
   - Delete `.agents/rules/template-mode.md`. It describes template mode, which is over,
     and a rule that can now only mislead.
   - Remove its row from `.agents/index/agents-index.md`.
   - Update `.agents/wiki/context/repository-map.md`: replace the sample tool listing
     with `ping`, and drop the "the four tools are samples" gotcha.
   - Rewrite `.agents/memory/state/repository-state.md` for the new project's starting
     state, and delete `.agents/memory/tasks/mcp-tools-refactor.md`, which records work
     done on the template rather than on this project.
   - In `.agents/memory/decisions/harness-branch-naming.md`, delete the `History`
     section: the decision itself carries over to the new project, but that section
     narrates work done on the template. Delete the whole file instead if the shared set
     has since absorbed the rule.
   - Update every row in `.agents/index/memory-index.md` to match what survives.
   - Keep `.agents/rules/secrets.md` only if the new project uses an API key; delete it
     and its index row otherwise.
10. **Delete `PROMPT.md`** (Self-destruct):
   - This file is only for the template. Remove it once scaffolding is complete.

## Step 4: Finalize
Provide the user with a summary of the changed files and ask if they would like you to commit these initial scaffolding changes following the standard LXAgents commit conventions (e.g., `chore(setup): ...`).
