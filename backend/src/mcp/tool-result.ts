import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function ok(result: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

export function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[mcp]", message);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: true, message }),
      },
    ],
    isError: true,
  };
}
