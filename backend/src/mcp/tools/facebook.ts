import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchFacebookPages } from "../../api/facebook/client";
import { FACEBOOK_REQUEST_SCHEMA } from "../../api/facebook/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const FACEBOOK_OPS: Record<string, DomainOp> = {
  search: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: FACEBOOK_REQUEST_SCHEMA, run: searchFacebookPages },
  },
};

const FACEBOOK_DESCRIPTION = `Facebook Page discovery and enrichment. Raw only — no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- search (raw) — discover Pages via Google CSE (site:facebook.com) and/or enrich known Page vanities/URLs from Page HTML (mbasic → www fallback). Provide entities and/or query (at least one required). country is always required by the schema — even for an entities-only lookup by known vanity/URL, pass the country the Page/business is in. input: entities? (Page vanity names or full Page URLs), query? (free-text, e.g. "dentists in Pune"), country (required, ISO alpha-2), state?, city?, keywords?, excludeKeywords?, limit? (1-250, default 100)`;

export function registerFacebookTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "facebook",
    description: FACEBOOK_DESCRIPTION,
    ops: FACEBOOK_OPS,
  });
}
