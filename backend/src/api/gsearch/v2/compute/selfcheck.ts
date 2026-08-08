/**
 * Self-check for Docs Explore parse/map (no network).
 * Run: `pnpm --filter @aixellabs/backend exec tsx src/api/gsearch/v2/compute/selfcheck.ts`
 */
import assert from "node:assert/strict";

import {
  buildDocsExploreRequestBody,
  docsExplorePaginationToken,
  extractDocsExplorePayload,
  mapDocsExploreItems,
  parseDocsExploreJson,
  stripXssiPrefix,
} from "./index";

// Pagination tokens from COMPETITORS_FINDINGS.md
assert.equal(docsExplorePaginationToken(1), "CAA=");
assert.equal(docsExplorePaginationToken(2), "CBQ=");
assert.equal(docsExplorePaginationToken(3), "CCg=");

const body = buildDocsExploreRequestBody("hello world", 1, "en", "en");
assert.ok(body.startsWith("request="));
const decoded = JSON.parse(decodeURIComponent(body.slice("request=".length)));
assert.equal(decoded[0], "documentsuggest.search.search_request");
assert.equal(decoded[1], "hello world");
assert.deepEqual(decoded[2], [20, "CAA="]);
assert.deepEqual(decoded[3], ["en", "en"]);
assert.equal(decoded[4], 1);

assert.equal(stripXssiPrefix(`)]}'\n[["ok"]]`), `[["ok"]]`);

const fixture = `)]}'
[["documentsuggest.search.search_response",[
  [null,["/m/03lm3",["Hello, world","Computer program"],["A classic demo",["https://en.wikipedia.org/wiki/Hello,_world","Wikipedia"]],["https://img.example/t.png",347,145,"https://source.example"],[["Founded",["1970"]],["CEO",["Alice","Bob"]]]]],
  [["https://en.wikipedia.org/wiki/Hello,_world","Hello, world!","Demo snippet"],[1609459200]],
  [["https://example.com/page","Example Title","More text"]]
],"CBQ="],["di",1]]`;

const raw = parseDocsExploreJson(fixture);
const { items, nextToken } = extractDocsExplorePayload(raw);
assert.equal(nextToken, "CBQ=");
assert.equal(items.length, 3);

const { knowledgeGraph, results } = mapDocsExploreItems(items, 1);
assert.ok(knowledgeGraph);
assert.equal(knowledgeGraph!.kgmid, "/m/03lm3");
assert.equal(knowledgeGraph!.title, "Hello, world");
assert.equal(knowledgeGraph!.type, "Computer program");
assert.equal(knowledgeGraph!.description, "A classic demo");
assert.equal(knowledgeGraph!.descriptionSource?.name, "Wikipedia");
assert.equal(knowledgeGraph!.image?.width, 347);
assert.equal(knowledgeGraph!.attributes?.Founded, "1970");
assert.equal(knowledgeGraph!.attributes?.CEO, "Alice, Bob");

assert.equal(results.length, 2);
assert.equal(results[0]!.id, "https://en.wikipedia.org/wiki/Hello,_world");
assert.equal(results[0]!.index, 1);
assert.equal(results[0]!.title, "Hello, world!");
assert.equal(results[0]!.displayUrl, "en.wikipedia.org");
assert.ok(results[0]!.publishedTime);
assert.equal(results[1]!.id, "https://example.com/page");
assert.equal(results[1]!.index, 2);

console.log("gsearch v2 compute selfcheck: ok");
