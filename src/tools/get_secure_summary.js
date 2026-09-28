/*
 * Sample tool: read-only, takes no arguments, requires the server API key.
 *
 * The key is read inside the handler so that a process which sets it after
 * startup still works. Deleted at scaffold time - see PROMPT.md.
 */

export const config = {
  name: "get_secure_summary",
  description:
    "Return a short authenticated status summary. Takes no arguments. Requires the API_KEY environment variable.",
};

export async function handler() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error(
      "get_secure_summary requires an API key. Set the API_KEY environment variable before starting the server."
    );
  }

  return {
    content: [
      {
        type: "text",
        text: "Authenticated. 3 records available, last updated 2026-01-01T00:00:00.000Z.",
      },
    ],
  };
}

export default { config, handler };
