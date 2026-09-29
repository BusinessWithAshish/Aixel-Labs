import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChatgptTool } from "./tools/chatgpt";
import { registerClaudeTool } from "./tools/claude";
import { registerCrawlTool } from "./tools/crawl";
import { registerFacebookTool } from "./tools/facebook";
import { registerGeminiTool } from "./tools/gemini";
import { registerGmapsTool } from "./tools/gmaps";
import { registerGsearchTool } from "./tools/gsearch";
import { registerLinkedinTool } from "./tools/linkedin";
import { registerSegmentTool } from "./tools/segment";
import { registerInstagramTool } from "./tools/instagram";
import { registerTrendsTool } from "./tools/trends";
import { registerTwitterTool } from "./tools/twitter";
import { registerMediaTool } from "./tools/media";
import { registerYoutubeTool } from "./tools/youtube";

export const MCP_SERVER_NAME = "aixel-intelligence";
export const MCP_SERVER_VERSION = "1.0.0";
/** One domain tool each: youtube, trends, instagram, twitter, gsearch, media, segment, chatgpt, claude, gemini, gmaps, facebook, linkedin, crawl. */
export const MCP_TOOL_COUNT = 14;

export function createAixelIntelligenceMcpServer(): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    // logging: lets tool calls send keepalive log notifications (domain-tool.ts).
    { capabilities: { logging: {} } },
  );

  registerYoutubeTool(server);
  registerTrendsTool(server);
  registerInstagramTool(server);
  registerTwitterTool(server);
  registerGsearchTool(server);
  registerMediaTool(server);
  registerSegmentTool(server);
  registerChatgptTool(server);
  registerClaudeTool(server);
  registerGeminiTool(server);
  registerGmapsTool(server);
  registerFacebookTool(server);
  registerLinkedinTool(server);
  registerCrawlTool(server);

  return server;
}
