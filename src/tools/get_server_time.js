/*
 * Sample tool: read-only, takes no arguments, needs no API key.
 *
 * Deleted at scaffold time - see PROMPT.md.
 */

export const config = {
  name: "get_server_time",
  description:
    "Return the server's current time as an ISO 8601 timestamp in UTC. Takes no arguments and requires no API key.",
};

export async function handler() {
  return {
    content: [{ type: "text", text: new Date().toISOString() }],
  };
}

export default { config, handler };
