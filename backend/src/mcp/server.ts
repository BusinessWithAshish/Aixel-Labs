import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChatgptTool } from "./tools/chatgpt";
import { registerClaudeTool } from "./tools/claude";
import { registerGsearchTool } from "./tools/gsearch";
import { registerInstagramTool } from "./tools/instagram";
import { registerTighteningTool } from "./tools/tightening";
import { registerTranscriptionTool } from "./tools/transcription";
import { registerTrendsTool } from "./tools/trends";
import { registerTwitterTool } from "./tools/twitter";
import { registerViralClipperTool } from "./tools/viral-clipper";
import { registerYoutubeTool } from "./tools/youtube";

export const MCP_SERVER_NAME = "aixel-intelligence";
export const MCP_SERVER_VERSION = "1.0.0";
/** One domain tool each: youtube, trends, instagram, twitter, gsearch, transcription, viral_clipper, tightening, chatgpt, claude. */
export const MCP_TOOL_COUNT = 10;

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
  registerTranscriptionTool(server);
  registerViralClipperTool(server);
  registerTighteningTool(server);
  registerChatgptTool(server);
  registerClaudeTool(server);

  return server;
}
