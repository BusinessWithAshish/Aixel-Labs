import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChatgptTool } from "./tools/chatgpt";
import { registerClaudeTool } from "./tools/claude";
import { registerGsearchTool } from "./tools/gsearch";
import { registerSegmentTool } from "./tools/segment";
import { registerInstagramTool } from "./tools/instagram";
import { registerTrendsTool } from "./tools/trends";
import { registerTwitterTool } from "./tools/twitter";
import { registerMediaTool } from "./tools/media";
import { registerYoutubeTool } from "./tools/youtube";

export const MCP_SERVER_NAME = "aixel-intelligence";
export const MCP_SERVER_VERSION = "1.0.0";
/** One domain tool each: youtube, trends, instagram, twitter, gsearch, media, segment, chatgpt, claude. */
export const MCP_TOOL_COUNT = 9;

export function createAixelIntelligenceMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  registerYoutubeTool(server);
  registerTrendsTool(server);
  registerInstagramTool(server);
  registerTwitterTool(server);
  registerGsearchTool(server);
  registerMediaTool(server);
  registerSegmentTool(server);
  registerChatgptTool(server);
  registerClaudeTool(server);

  return server;
}
