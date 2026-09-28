import { z } from "zod";
import { readSetFile } from "../content.js";

/*
 * The one tool. It serves the Roblox security set and reaches nothing else -
 * no network, no key, no external service.
 */

export const config = {
  name: "roblox_security_instruction",
  description:
    "Read one Roblox security convention by path, e.g. 'roblox/security/zero-trust-networking.md'. Covers client zero-trust, RemoteEvent and RemoteFunction payload validation, and where the client/server trust boundary goes. Read-only - this tool cannot write.",
  schema: {
    path: z
      .string()
      .describe(
        "Path inside the set, e.g. 'roblox/security/trust-boundaries.md'. Never a leading slash, never '..'.",
      ),
  },
};

export async function handler({ path }) {
  const text = await readSetFile(path);

  if (text === null) {
    // A lookup miss, not a server fault, so it is ordinary content rather than a
    // thrown error. A caller cannot tell a returned error apart from a real answer,
    // and this is not a real answer.
    return {
      content: [
        {
          type: "text",
          text: `not found: ${path}\n\nPaths are relative to the set root, without the .agents/ prefix. Read 'index/roblox-security-index.md' first - it routes the two files under 'roblox/security/' by the question you are trying to answer.`,
        },
      ],
    };
  }

  return { content: [{ type: "text", text }] };
}

export default { config, handler };
