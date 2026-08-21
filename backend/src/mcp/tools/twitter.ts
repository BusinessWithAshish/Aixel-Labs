import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchTwitterSearch,
  fetchTwitterTrending,
  fetchTwitterTweet,
  fetchTwitterUser,
  fetchTwitterUserTweets,
} from "../../api/twitter/client";
import {
  TWITTER_SEARCH_REQUEST_SCHEMA,
  TWITTER_TRENDING_REQUEST_SCHEMA,
  TWITTER_TWEETS_REQUEST_SCHEMA,
  TWITTER_TWEET_REQUEST_SCHEMA,
  TWITTER_USER_REQUEST_SCHEMA,
} from "../../api/twitter/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const TWITTER_OPS: Record<string, DomainOp> = {
  user: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TWITTER_USER_REQUEST_SCHEMA, run: fetchTwitterUser },
  },
  tweet: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TWITTER_TWEET_REQUEST_SCHEMA, run: fetchTwitterTweet },
  },
  user_tweets: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TWITTER_TWEETS_REQUEST_SCHEMA, run: fetchTwitterUserTweets },
  },
  trending: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TWITTER_TRENDING_REQUEST_SCHEMA, run: fetchTwitterTrending },
  },
  search: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TWITTER_SEARCH_REQUEST_SCHEMA, run: fetchTwitterSearch },
  },
};

const TWITTER_DESCRIPTION = `Public X/Twitter guest GraphQL/REST. Raw only — no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- user (raw) — profile by handle/@handle/URL. input: username, country?
- tweet (raw) — one tweet by ID/status URL. includeRelated adds same-author recents. input: tweet, includeRelated?, country?
- user_tweets (raw) — profile + recent timeline. input: username, limit?, cursor?, country?
- trending (raw) — X trends/place.json for a country (WOEID; unknown ISO → worldwide). Use first for "what's trending now". input: country?, limit?
- search (raw) — GSearch site:x.com + GraphQL hydrate (native search is login-walled). filter=tweet|user. Needs Evomi. input: query, filter?, limit?, pages?, country?

Flow: trending or search → user / tweet / user_tweets. Guest session, no user login.`;

export function registerTwitterTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "twitter",
    description: TWITTER_DESCRIPTION,
    ops: TWITTER_OPS,
  });
}
