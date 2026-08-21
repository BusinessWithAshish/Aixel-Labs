import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchGsearch } from "../../api/gsearch/client";
import { GSEARCH_REQUEST_SCHEMA } from "../../api/gsearch/schemas";
import { fetchGsearchV2 } from "../../api/gsearch/v2/client";
import { GSEARCH_V2_REQUEST_SCHEMA } from "../../api/gsearch/v2/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const GSEARCH_OPS: Record<string, DomainOp> = {
  search: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: GSEARCH_REQUEST_SCHEMA, run: fetchGsearch },
  },
  search_v2: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: GSEARCH_V2_REQUEST_SCHEMA, run: fetchGsearchV2 },
  },
};

const GSEARCH_DESCRIPTION = `Google web search. Raw only — both ops are scrapes, no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- search (raw) — CSE organic results (POST /gsearch). timeFilter defaults to day. input: searchQuery, country, region?, state?, language?, pages?, timeFilter?, safe?
- search_v2 (raw) — Docs Explore (knowledge graph + organic) unless timeFilter is set, then CSE fallback (POST /gsearch/v2). timeFilter has no default. input: searchQuery, country, region?, state?, language?, pages?, timeFilter?, safe?

Operators confirmed on CSE (search / search_v2 CSE fallback): "exact phrase", site:, filetype:, intitle:, -exclude, OR, ( ), before:/after:YYYY-MM-DD, * in quotes. Avoid allintitle/allinurl/allintext/intext/cache/related/link/AROUND/define/weather/stocks/movie/map/source.

country is required (ISO alpha-2). Do not use this for YouTube niche research (youtube) or Trends demand curves (trends).`;

export function registerGsearchTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "gsearch",
    description: GSEARCH_DESCRIPTION,
    ops: GSEARCH_OPS,
  });
}
