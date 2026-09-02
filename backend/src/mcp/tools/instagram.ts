import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchFromEntities, fetchFromQuery } from "../../api/instagram/client";
import {
  INSTAGRAM_PROFILE_LOOKUP_SCHEMA,
  INSTAGRAM_PROFILE_SEARCH_SCHEMA,
} from "../../api/instagram/schemas";
import { fetchInstagramAdvancedPosts } from "../../api/instagram/advanced/client";
import { IG_ADVANCED_POSTS_REQUEST_SCHEMA } from "../../api/instagram/advanced/schemas";
import { fetchInstagramAdvancedSearch } from "../../api/instagram/advanced/search/client";
import { IG_ADVANCED_SEARCH_REQUEST_SCHEMA } from "../../api/instagram/advanced/search/schemas";
import { instagramAccountIntelligenceService } from "../../api/instagram/intelligence/account/service";
import { INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA } from "../../api/instagram/intelligence/account/schemas";
import {
  AGGREGATE_ACCOUNT_SIGNALS_SCHEMA,
  aggregateAccountSignalsService,
} from "../../api/instagram/intelligence/aggregation";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const INSTAGRAM_OPS: Record<string, DomainOp> = {
  profile: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: INSTAGRAM_PROFILE_LOOKUP_SCHEMA,
      run: (input) =>
        fetchFromEntities(input.entities, input.country, input.limit),
    },
  },
  search_profiles: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: INSTAGRAM_PROFILE_SEARCH_SCHEMA,
      run: fetchFromQuery,
    },
  },
  posts: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: IG_ADVANCED_POSTS_REQUEST_SCHEMA,
      run: fetchInstagramAdvancedPosts,
    },
  },
  content_leads: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: IG_ADVANCED_SEARCH_REQUEST_SCHEMA,
      run: fetchInstagramAdvancedSearch,
    },
  },
  account: {
    defaultLayer: MCP_LAYER.INTEL,
    intel: {
      schema: INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA,
      run: instagramAccountIntelligenceService,
    },
  },
  aggregate_account: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: AGGREGATE_ACCOUNT_SIGNALS_SCHEMA,
      run: aggregateAccountSignalsService,
    },
  },
};

const INSTAGRAM_DESCRIPTION = `Instagram profiles, posts, discovery, and account intelligence.

Call with { op, layer?, input }. Invalid layer combo fails.

Ops:
- profile (raw only) — lookup by handle/URL. input: entities[], country, limit?
- search_profiles (raw only) — GSearch discovery biased to profile titles. input: query, country?, city?, state?, hashtags?, keywords?, excludeKeywords?, excludeHashtags?, limit?
- posts (raw only) — paginated Posts-tab media. input: username, cursor?, count?, pages?
- content_leads (raw only) — GSearch content-first (/p/, /reel/) discovery. Use when search_profiles is thin. input: query, country?, kinds?, pages?, maxResolve?, enrichProfiles?
- account (intel only) — profile + posts + per-post engagement/velocity. The only Instagram intel overlay. input: username, country, pages?
- aggregate_account (raw only, compute) — outlier/cadence stats from one account's intel posts[]. Never mix accounts. input: items[], username?

Discovery order: search_profiles → content_leads.`;

export function registerInstagramTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "instagram",
    description: INSTAGRAM_DESCRIPTION,
    ops: INSTAGRAM_OPS,
  });
}
