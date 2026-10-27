# Content Lab: PRD

Module `CONTENT_LAB` · routes under `/content-lab` · behind the `content-lab` page flag until launch. Admins on the `test` tenant see it now.

Research behind this: [`research/poppy-competitors/`](../../../../research/poppy-competitors/README.md). How Poppy is actually used is in [05](../../../../research/poppy-competitors/05-how-poppy-is-used.md).
Clickable prototype: `research/poppy-competitors/wireframes/creator-intel-demo.html`.

## One line

Find what's working in any niche on YouTube and Instagram, break down why, and turn it into your own posts on a board whose inputs fill themselves.

## Why it wins

YouTube Studio and Instagram insights show **only your account, only after you post**. Poppy-style canvases make you **find the winners by hand**: you paste a URL, then a per-channel "top 10 outliers". Content Lab:

1. **Finds winners across a whole niche**, not one channel. Ranked by how far each post beats its creator's usual views, with the reason in plain words.
2. **Breaks down anyone's post**: hook, structure, CTA, thumbnail. The view adapts to the format (long video, Reel/Short, carousel).
3. **Checks your idea before you post**: scores a title or hook against this month's niche winners and gives three stronger versions.

On top of these sits a **Board** (canvas). Poppy's recipe is voice + proven examples + structure → chat. On our board each of those boxes fills itself from our data and stays live.

## Users

Agencies and social media managers (multi-client), founders and consultants doing founder-led content, and solo creators. Indian creators get Hinglish output and city filters, which competitors lack.

## Pages (8)

| # | Route | Page | Sidebar item |
|---|---|---|---|
| 1 | `/content-lab/search` | **Search home**: one smart box (topic / link / @creator) + 3 job cards + "vs Studio" table | Search |
| 2 | `/content-lab/search/explore?q=` | **What's working**: cross-creator outliers, YT + IG toggle, country/city/date, 3 plain-English takeaways | (from Search) |
| 3 | `/content-lab/search/post/[postId]` | **Breakdown**: format-aware hook/structure/CTA/thumbnail + "why it worked" | (from Search) |
| 4 | `/content-lab/search/check` | **Check my idea**: score vs niche winners, red/green reasons, 3 rewrites | (from Search) |
| 5 | `/content-lab/boards` | **Boards list** + 5 templates | Boards |
| 6 | `/content-lab/boards/[boardId]` | **Board canvas** | (from Boards) |
| 7 | `/content-lab/watching` | **Watching**: tracked creators + new-outlier alerts | Watching |
| 8 | `/content-lab/settings` | **Settings**: connected accounts, AI keys (BYOK), MCP link, usage | Settings |

Sidebar submodules: `SEARCH`, `BOARDS`, `WATCHING`, `SETTINGS` (values prefixed `CONTENT_LAB_`). Explore, post and check nest under `/content-lab/search` because the path ACL is prefix-based, so the Search grant covers them and no grant leaks into another page.

## The board

**Nodes.** **Auto** nodes are built from our data, **Live** nodes refresh on a schedule, and **You** nodes are user input.

| Node | Kind | Fills from |
|---|---|---|
| My voice | Auto | connected accounts: transcripts + captions, separate long- and short-form profiles |
| What's working | Live | topic + platforms + country/city → cross-creator outliers |
| Creator | Live | one @handle on any platform → their outliers |
| Watching | Live | the watchlist → new outliers |
| Post | Auto | any pasted link → its breakdown |
| Hooks, structure, CTAs | Auto | extracted from every post or outlier node wired into it |
| Note | You | free text / voice note |
| Write | You | format + language + model (BYOK) |
| Output | You | editable draft, with each line citing its source post |
| Check before posting | Auto | score of the connected output vs niche winners |

**Combining platforms** happens through how nodes are wired. There are no separate per-platform screens.

- **Mix inputs.** "What's working" takes `platforms: [YT, IG, …]`, and every item carries its platform badge. Wire a YouTube creator and an Instagram creator into the same Hooks node to get one pattern set from both.
- **Fan out outputs.** One Write node feeds several Output nodes, one per platform format (YT script, Reel, carousel, LinkedIn post, X thread). One idea becomes four native versions.
- **Cross-adapt.** Wire a YouTube outlier into Write with format = Reel to turn a long video's structure into a short.
- **Check per platform.** Each Output's Check node scores against *that platform's* winners.

**Templates** (a board never starts blank), one per workflow found in the Poppy research:
1. Reel from niche outliers
2. YouTube script
3. Repurpose one video
4. Ad hooks from competitors (later: needs an ads module)
5. Why did it win?

**Mobile.** The canvas does not shrink onto a phone. Under the `md` breakpoint the board shows a **Flow view**: nodes stacked as cards in wiring order (inputs → Hooks → Write → Outputs → Check). Each card shows chips like "feeds Write", and connections are edited from a sheet ("Connect to…"). A toggle opens the real canvas with pinch-zoom and pan for people who want it. Boards are made and edited on desktop, and run and read on mobile.

## AI and cost model

- All generation runs on the user's own key (Claude / OpenAI / Gemini; the Gemini free tier works), or inside the user's own Claude/ChatGPT through our MCP.
- We charge for data (scrapes, refreshes, tracked creators). Reading results feels unlimited because our marginal cost is proxy bandwidth.
- Account connections (YouTube, Instagram, X, LinkedIn) go through Composio, read-only by default. YouTube + Instagram first; X and LinkedIn start as beta because their own APIs are limited.

## Build list

**M0: module skeleton (this branch, first commit)**
- [ ] `Modules.CONTENT_LAB` + `CONTENT_LAB_SUB_MODULES` in `backend/src/db/types.ts`
- [ ] Module access, `SubModuleUrls`, sidebar icons, `content-lab` page flag (off)
- [ ] 8 page shells with `PageLayout`, links between them, the empty states the PRD describes

**M1: Find + Learn (backend first)**
- [ ] YouTube outlier multiple: views ÷ the channel's median over its last ~30 uploads, long-form and Shorts separately (`youtube/intelligence`)
- [ ] Instagram cross-account niche aggregate (`instagram/intelligence/aggregation`)
- [ ] Reel → transcript → hook/CTA, reusing the YouTube transcript compute
- [ ] BFF actions for the explore + breakdown pages; real data on pages 2 and 3

**M2: Check + Settings**
- [ ] Niche-winner stats and an idea-scoring endpoint; page 4
- [ ] BYOK key storage (reuse the per-owner Gemini key pattern) + MCP link; page 8
- [ ] Composio connect for YouTube + Instagram

**M3: Boards**
- [ ] Mongo collections `content_lab_boards` (nodes, edges, template) via `backend-db`
- [ ] Canvas (React Flow, MIT) + Flow view for mobile; pages 5 and 6
- [ ] Node runners: Auto/Live nodes call the M1 services; Write runs on BYOK

**M4: Watching + alerts**
- [ ] Tracked creators + daily snapshots (scheduled job), new-outlier detection; page 7
- [ ] Weekly digest (email / WhatsApp)

**Not in scope yet:** ads-library module, TikTok, auto-posting, own-analytics OAuth beyond Composio basics.

## Open questions

- Pricing: data-credit bundles vs a flat monthly plan per workspace.
- Whether agencies get one workspace per client in v1 or in M4.
