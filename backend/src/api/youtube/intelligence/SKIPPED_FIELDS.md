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

| Field | Blocked by | Path forward |
|-------|------------|--------------|
| `velocityScore` | Not requested on channel video intelligence yet | Add when needed (`channelInfo.subscribers` is on the response) |

### Channel video caveats (implemented fields)

- `publishedAt`, `duration`, `likeCount`, and `commentCount` on intelligence response items come from batched video-meta (`get_watch`), not channel browse lockups.
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
- **`null` when both samples are limit-censored** (avoids a misleading `0.5` artifact)
- `0` when Shorts tab is absent/empty and videos are present

Channels without a Shorts tab soft-empty the shorts harvest (`items: []`) so videos intelligence still succeeds.

## Suggested video items (`POST /youtube/intelligence/video/suggested`)

No deferred per-item fields. `publishedAt` and `channelSubscribers` are merged onto intelligence response items via batched video-meta (`get_watch`). Raw `/youtube/video/suggested` items still only expose relative `publishedText`.

## Handle (`POST /youtube/intelligence/handle`)

No intelligence fields implemented yet. The handler returns the raw handle response with an empty `intelligence: {}` placeholder.
