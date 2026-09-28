/*
 * Sample tool: takes zod-validated parameters, needs no API key.
 *
 * `schema` is a zod raw shape, not a z.object - that is what
 * server.tool(name, description, schema, handler) expects.
 *
 * Deleted at scaffold time - see PROMPT.md.
 */

import { z } from "zod";

export const config = {
  name: "calculate_sum",
  description:
    "Add two numbers and return the sum. Requires no API key.",
  schema: {
    a: z.number().describe("The first addend."),
    b: z.number().describe("The second addend."),
  },
};

export async function handler({ a, b }) {
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
}

export default { config, handler };
