import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchRedditArchive } from "../../api/reddit/archive";
import {
  fetchRedditFeed,
  fetchRedditPost,
  fetchRedditSearch,
  fetchRedditSubreddit,
  fetchRedditUser,
  fetchRedditWiki,
} from "../../api/reddit/client";
import {
  REDDIT_ARCHIVE_REQUEST_SCHEMA,
  REDDIT_FEED_REQUEST_SCHEMA,
  REDDIT_POST_REQUEST_SCHEMA,
  REDDIT_SEARCH_REQUEST_SCHEMA,
  REDDIT_SUBREDDIT_REQUEST_SCHEMA,
  REDDIT_USER_REQUEST_SCHEMA,
  REDDIT_WIKI_REQUEST_SCHEMA,
} from "../../api/reddit/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const REDDIT_OPS: Record<string, DomainOp> = {
  feed: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_FEED_REQUEST_SCHEMA, run: fetchRedditFeed },
  },
  post: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_POST_REQUEST_SCHEMA, run: fetchRedditPost },
  },
  subreddit: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_SUBREDDIT_REQUEST_SCHEMA, run: fetchRedditSubreddit },
  },
  user: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_USER_REQUEST_SCHEMA, run: fetchRedditUser },
  },
  search: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_SEARCH_REQUEST_SCHEMA, run: fetchRedditSearch },
  },
  wiki: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_WIKI_REQUEST_SCHEMA, run: fetchRedditWiki },
  },
  archive: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: REDDIT_ARCHIVE_REQUEST_SCHEMA, run: fetchRedditArchive },
  },
};

const REDDIT_DESCRIPTION = `Public Reddit via the logged-out web client's anonymous token on oauth.reddit.com (JSON). Raw only — no intelligence overlay. Needs Evomi (Reddit 403s datacenter IPs).

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- feed (raw) — subreddit or sitewide (popular/all) posts. input: subreddit?, sort?, time?, limit?, after?, country?
- post (raw) — one post + flattened comment tree (depth-first, with depth/parentId) + collapsed "more" ids. input: post (id/URL/redd.it/share link), commentSort?, commentLimit?, depth?, country?
- subreddit (raw) — about (subscribers, active users, description, sidebar) + rules. input: subreddit, includeRules?, country?
- user (raw) — profile/karma + overview|submitted|comments. input: username, content?, sort?, time?, limit?, after?, country?
- search (raw) — type=post (sitewide or within subreddit), subreddit, or user. input: query, type?, subreddit?, sort?, time?, includeNsfw?, limit?, after?
- wiki (raw) — one subreddit wiki page as markdown. input: subreddit, page?, country?
- archive (raw) — bulk / historical posts or comments from the Arctic Shift archive (no Reddit request, no proxy, near real-time). Ordered by creation time only. input: kind? (post|comment), subreddit?, author?, post? (comments under one post), query? (needs subreddit/author/post), after?, before? (ISO date, epoch, or 7d/3m/1year), sort? (desc|asc), limit? (≤1000), cursor?. Scores and comment counts on items younger than ~36h are not final; comment depth is always 0 (use parentId).

Limits: live ops share ~100 Reddit requests per 5 min; calls queue and wait out short 429s, a long wait returns 429 with "retry in Ns". Default limit is 100 per page — pass a smaller limit when you only need a few. Identical calls are cached 1–10 min. Use archive for volume or history, live ops for ranking (hot/top), search relevance, and current scores.

Paging: pass the previous data.after as after (archive: data.next as cursor). Flow: search/feed → post for comments → user/subreddit for context.`;

export function registerRedditTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "reddit",
    description: REDDIT_DESCRIPTION,
    ops: REDDIT_OPS,
  });
}
