import { Router } from "express";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createAixelIntelligenceMcpServer,
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
    const server = createAixelIntelligenceMcpServer();
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

/**
 * Open `GET /mcp` streams: the channel a client keeps open for server-sent
 * notifications. This server is stateless and never sends any, so such a stream
 * ends only when its client drops it.
 */
const notificationStreams = new Set<Response>();

/**
 * For a draining process (`server.ts`, on SIGTERM): end every open notification
 * stream so its client reopens it on the slot that now takes the traffic.
 * Otherwise these streams would hold the old slot open until its TimeoutStopSec.
 */
export function closeMcpStreams() {
  for (const res of notificationStreams) res.end();
}

mcpRouter.all("/", (req, res) => {
  if (req.method === "GET") {
    notificationStreams.add(res);
    res.once("close", () => notificationStreams.delete(res));
  }
  void handleMcpRequest(req, res);
});

export default mcpRouter;
