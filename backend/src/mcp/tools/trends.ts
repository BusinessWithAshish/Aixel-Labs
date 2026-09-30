import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
  GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
} from "../../api/google-trends/interest/schemas";
import {
  fetchGoogleTrendsCompare,
  fetchGoogleTrendsInterest,
} from "../../api/google-trends/interest/helpers";
import { GOOGLE_TRENDS_REQUEST_SCHEMA } from "../../api/google-trends/schemas";
import { fetchGoogleTrendsTrending } from "../../api/google-trends/helpers";
import { googleTrendsInterestIntelligenceService } from "../../api/google-trends/intelligence/single/service";
import { googleTrendsCompareIntelligenceService } from "../../api/google-trends/intelligence/compare/service";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const TRENDS_OPS: Record<string, DomainOp> = {
  interest: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: {
      schema: GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
      run: fetchGoogleTrendsInterest,
    },
    intel: {
      schema: GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
      run: googleTrendsInterestIntelligenceService,
    },
  },
  compare: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: {
      schema: GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
      run: fetchGoogleTrendsCompare,
    },
    intel: {
      schema: GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
      run: googleTrendsCompareIntelligenceService,
    },
  },
  trending: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: GOOGLE_TRENDS_REQUEST_SCHEMA,
      run: fetchGoogleTrendsTrending,
    },
  },
};

const TRENDS_DESCRIPTION = `Google Trends interest, comparison, and trending-now.

Call with { op, layer?, input }. Invalid layer combo fails.

Ops:
- interest (raw|intel, default intel) — one keyword over time + related queries + geo. input: keyword, geo?, hl?, timeframe?, category?, property?, limit?, tz?
- compare (raw|intel, default intel) — 2–5 unique keywords on a shared 0–100 scale. intel adds dominance/momentum/crossovers. input: keywords[], geo?, hl?, timeframe?, category?, property?, limit?, tz?
- trending (raw only) — live trending page for a country. input: geo?, hl?, hours?, category?, sort?, status?, limit?

Prefer intel for analysis. trending has no overlay.`;

export function registerTrendsTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "trends",
    description: TRENDS_DESCRIPTION,
    ops: TRENDS_OPS,
  });
}
