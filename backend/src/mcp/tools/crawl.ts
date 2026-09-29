import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { scrapeCrawl } from "../../api/crawl/client";
import { CRAWL_REQUEST_SCHEMA } from "../../api/crawl/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const CRAWL_OPS: Record<string, DomainOp> = {
  scrape: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: CRAWL_REQUEST_SCHEMA, run: scrapeCrawl },
  },
};

const CRAWL_DESCRIPTION = `Turn company domains / website URLs into published contact profiles (emails, phones, socials, light meta/address). Sync TLS crawl — no browser-worker/Botasaurus/Playwright. Raw only — no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- scrape (raw) — priority BFS crawl of each domain's own site. Per-domain failures return an empty profile with status instead of failing the batch; id is a stable hash of the registrable domain (for sourceId). input: domains[] (1-50, domain or full URL), maxPages?, maxDepth?, thorough?, country? (ISO alpha-2)`;

export function registerCrawlTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "crawl",
    description: CRAWL_DESCRIPTION,
    ops: CRAWL_OPS,
  });
}
