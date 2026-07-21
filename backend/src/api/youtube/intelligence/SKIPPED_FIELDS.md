# Deferred intelligence fields

Fields not implemented yet. Revisit when raw harvest exposes new data or a new endpoint is added.

## Video (`POST /youtube/intelligence/video`)

| Field | Blocked by | Path forward |
|-------|------------|--------------|
| `shareCount` | Not in InnerTube microformat or watch panels — only share UI endpoints | Reverse-engineer a share-count field if YouTube exposes it |
| `playlistCount` | No “added to N playlists” count in `get_watch` / `ytInitialData` | Find factoid or engagement panel path in raw JSON |
| `viewCountRank` | Needs full channel video list | Call channel API + rank by `views` (capped by fetch limit) |

## Search — video items (`POST /youtube/intelligence/search`)

| Field | Blocked by | Path forward |
|-------|------------|--------------|
| `decayAdjustedVelocity` | Not requested on search intelligence yet | Add when needed (requires `velocityScore`) |

### Search video caveats (implemented fields)

- `publishedAt` and `channelSubscribers` are merged onto intelligence response items via batched `get_watch` (video-meta), not from search `videoRenderer`.
- Raw `/youtube/search` video items still only expose `publishedTimeText` — intelligence does **not** parse relative publish text.
- `velocityScore` and `channelTier` are null when video-meta cannot resolve `publishedAt` or `channelSubscribers` for that video.

## Search — channel items (`POST /youtube/intelligence/search`)

No deferred per-item fields.

### Search channel caveats (implemented fields)

- `channelTier` is derived from the raw search channel item's `subscribers` field — no video-meta batch call is needed for channel items.
- `channelTier` is `null` when `subscribers` is missing on the raw search channel item.
- Search channel items do **not** receive the richer channel-info fields available on `/youtube/intelligence/channel` (e.g. `channelAgeInDays`, `uploadsPerWeek`) — those require a channel browse harvest.

## Channel — video items (`POST /youtube/intelligence/channel`, `contentType: videos`)

No deferred per-item fields. `titleWordCount`, `descriptionLength`, and `velocityScore` are now computed (parity with search video items). `descriptionLength` comes from the `get_watch` `shortDescription` (via video-meta), not the channel browse lockup (which has no description). `velocityScore` prefers the per-video `channelSubscribers` from `get_watch` and falls back to `channelInfo.subscribers` so it resolves even when the collaborator-dialog path returns null.

### Channel video caveats (implemented fields)

- `publishedAt`, `duration`, `likeCount`, and `commentCount` on intelligence response items come from batched video-meta (`get_watch`), not channel browse lockups.
- `description` (raw) and `descriptionLength` come from `get_watch` `videoDetails.shortDescription`, not channel browse.
- Raw `/youtube/channel` video items still only expose relative `publishedText` and no duration.
- `engagementRatio` is null when likes, comments, or views cannot be resolved from video-meta / lockup data.
- `rankOnChannel` — rank among **videos returned in this response** (capped by `limit`, max 1000), not guaranteed all-time channel catalog.
- `viewsVsChannelAvg` — average is over the same fetched video set, not full channel history.

### Channel info (`channelInfo` → top-level `intelligence`)

`joinedDateText` is absolute (e.g. `"Joined Aug 22, 2007"`), so `channelAgeInDays` is implemented. If YouTube returns unparseable join text, `channelAgeInDays` and `uploadsPerWeek` are `null`.

`subscriberEfficiencyRatio` and `viewsPerSubscriber` are the same value (`totalViews / subscribers`) under two names for downstream consumers.

`uploadsLast30Days`, `uploadsLast90Days`, and `recentVelocityTrend` are computed from the **videos tab sample** with video-meta `publishedAt`. Counts are `null` when no publish dates resolve. `recentVelocityTrend` compares mean `viewsPerDay` for videos published in the last 30 days vs 31–90 days (`>10%` change → accelerating/decelerating, otherwise stable); `null` when either window lacks computable velocity data.

| Field | Blocked by | Path forward |
|-------|------------|--------------|
| `isKidsChannel` | InnerTube only exposes `isFamilySafe`, not `madeForKids` | Harvest MFK if available, or Data API `status.madeForKids`; **do not** alias family-safe (returns `null` today) |

`shortCount` / `videoOnlyCount` are **sizes of harvested tab samples** (capped by `limit`), not full catalog totals unless the sample is shorter than `limit`.

`shortRatio` is:
- exact when both tabs finish under `limit`
- anchored to `channelInfo.videoCount` when exactly one tab is complete
- **`null` when both samples are limit-censored** (avoids a misleading `0.5` artifact); `shortRatioCensored: true` is set alongside so consumers can distinguish "unknown due to sampling" from "zero/missing"
- `0` when Shorts tab is absent/empty and videos are present (`shortRatioCensored: false`)

Channels without a Shorts tab soft-empty the shorts harvest (`items: []`) so videos intelligence still succeeds.

### Channel — short items (`contentType: shorts`)

No deferred per-item fields. Shorts now have full title/duration/description parity with video items: `titleLength`, `titleWordCount`, `titleHasNumber`, `titleHasQuestion`, `titleHasYear`, `durationBucket`, `isShort`, `descriptionLength`, `publishedDaysAgo`, `viewsPerDay`, `rankOnChannel`, `viewsVsChannelAvg`. `descriptionLength` comes from the `get_watch` `shortDescription` (via video-meta) since the shorts browse lockup has no description. `velocityScore` is intentionally **not** computed for shorts — the `views / subscribers / day` ratio is meaningless for shorts (the Shorts shelf drives views independent of subscribers), so it is omitted rather than producing a misleading number.

## Suggested video items (`POST /youtube/intelligence/video/suggested`)

No deferred per-item fields. `publishedAt` and `channelSubscribers` are merged onto intelligence response items via batched video-meta (`get_watch`). Raw `/youtube/video/suggested` items still only expose relative `publishedText`. `titleWordCount`, `descriptionLength`, and `velocityScore` are now computed (parity with search video items). `descriptionLength` comes from the `get_watch` `shortDescription` (via video-meta) since the suggested-items raw response has no description.

## Handle (`POST /youtube/intelligence/handle`)

`channelTier` is now computed from the subscriber count extracted off the handle page's `ytInitialData` header (no separate channel browse needed). The raw response also now carries `title` and `subscribers` extracted from the same handle page. `channelTier` is `null` only when the subscriber count cannot be parsed from the handle page.

## Video (`POST /youtube/intelligence/video`)

`viewCountText` is YouTube's formatted view-count string (e.g. `"11,997 views"`), extracted from the watch-next `videoPrimaryInfoRenderer.viewCount.videoViewCountRenderer.viewCount.simpleText` when available, with a `toLocaleString("en-US") + " views"` fallback built from the raw numeric count so the field is never a bare number like `"11997"`.

## Aggregation — `aggregate_keyword_signals` (MCP)

`velocityLift` is now the real `topQuartileFrequency / bottomQuartileFrequency` ratio and is **`null`** when a keyword never appears in the bottom quartile (the ratio is undefined, not capped). A new `topQuartileExclusive: boolean` flag surfaces those keywords separately. The previous `Math.max(bottom, 1)` cap was removed because it conflated `5/0` with `5/1` (both yielded `5`), which was misleading. Sort order: computable `velocityLift` descending (nulls last), then `topQuartileExclusive` descending, then raw `frequency` descending.
