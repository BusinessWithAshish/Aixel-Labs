import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// DISABLED 2026-09-30 — interest/compare both call fetchGoogleTrendsInterestCore
// (/trends/api/explore + widgetdata), which is hard-429'd from every network
// path we have (this server's direct IP, 8 fresh Evomi proxy sessions across
// two geo values, and a completely fresh cookie-less real browser with zero
// history — blocked instantly on the plain HTML page, before any API call
// even fired). Not a request-shape or session-reputation issue we can fix
// the way `trending`'s consent-wall or `facebook`'s probabilistic gate were —
// see "Interest over time (raw)" in api/google-trends/README.md for the full
// investigation and "Debugging a scraper that suddenly gets blocked" in the
// backend-utils skill for the method. Re-enable by restoring these two
// imports and the `interest`/`compare` entries in TRENDS_OPS below once a fix
// or a different network path is found.
// import {
//   GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
//   GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
// } from "../../api/google-trends/interest/schemas";
// import {
//   fetchGoogleTrendsCompare,
//   fetchGoogleTrendsInterest,
// } from "../../api/google-trends/interest/helpers";
import { GOOGLE_TRENDS_REQUEST_SCHEMA } from "../../api/google-trends/schemas";
import { fetchGoogleTrendsTrending } from "../../api/google-trends/helpers";
// import { googleTrendsInterestIntelligenceService } from "../../api/google-trends/intelligence/single/service";
// import { googleTrendsCompareIntelligenceService } from "../../api/google-trends/intelligence/compare/service";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const TRENDS_OPS: Record<string, DomainOp> = {
  // interest: — disabled, see note above.
  // compare: — disabled, see note above.
  trending: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: GOOGLE_TRENDS_REQUEST_SCHEMA,
      run: fetchGoogleTrendsTrending,
    },
  },
};

const TRENDS_DESCRIPTION = `Google Trends trending-now.

Call with { op, layer?, input }. Invalid layer combo fails.

Ops:
- trending (raw only) — live trending page for a country. input: geo?, hl?, hours?, category?, sort?, status?, limit?

\`interest\` and \`compare\` (single/multi-keyword interest-over-time + related queries + geo) are temporarily disabled — Google is hard rate-limiting that endpoint (429) from every network path available to this server, confirmed via direct IP, 8 fresh proxy sessions, and a fresh real browser with zero history. Not a bug in this tool; there is currently no working request shape. See api/google-trends/README.md for the investigation.`;

export function registerTrendsTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "trends",
    description: TRENDS_DESCRIPTION,
    ops: TRENDS_OPS,
  });
}
