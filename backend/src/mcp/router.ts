import { Router } from "express";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createYoutubeIntelligenceMcpServer,
  MCP_SERVER_NAME,
  MCP_TOOL_COUNT,
} from "./server";

const mcpRouter: Router = Router();

mcpRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: MCP_SERVER_NAME,
    tools: MCP_TOOL_COUNT,
  });
});

async function handleMcpRequest(req: Request, res: Response) {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createYoutubeIntelligenceMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(
      "[mcp] request failed",
      err instanceof Error ? err.message : err,
    );
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal server error",
        },
        id: null,
      });
    }
  }
}

mcpRouter.all("/", (req, res) => {
  void handleMcpRequest(req, res);
});

export default mcpRouter;
