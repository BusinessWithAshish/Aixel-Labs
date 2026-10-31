# Technical architecture — LineFinder

LineFinder is a signed-in module on its own internal tenant, built the same way as Content
Lab: pages under `(protected)`, Mongo through server actions, and a stateless backend. It is
not a product tenant. Products like Bluff and Big Business stay signed-out and unchanged.

## 1. Tenant and module model

Tenant record, created in Manage Tenants:

```text
name: linefinder
label: LineFinder
type: none (a normal internal tenant, not PRODUCT)
defaultModuleAccess: { LINE_FINDER: [LINE_FINDER_SEARCH] }
```

Module, in `backend/src/db/types.ts`:

```ts
Modules.LINE_FINDER
LINE_FINDER_SUB_MODULES.SEARCH  // /line-finder/search
LINE_FINDER_SUB_MODULES.PEOPLE  // /line-finder/people
```

- **No change to `middleware.ts` or the sidebar.** A tenant with no type already sends `/` to the
  tenant home and shows sign-in and the sidebar.
- **Users on this tenant see this module only**, because that's what its `defaultModuleAccess` grants.
- **Admins see every module on every tenant.** That's how admin access works today, and this tenant
  doesn't change it.

### Flag

Page flag `line-finder` is on. Who sees the pages is decided by module access: users with `LINE_FINDER`,
and admins, who have every module on every tenant.

## 2. Folder layout

```text
backend/src/api/line-finder/      # stateless: no Mongo
  constants.ts        # routes, limits, label values, error texts
  schemas.ts          # Zod requests, including those the server actions validate
  types.ts            # responses and what the pages draw
  compute/
    sound.ts          # Hindi and Roman to sound form and skeleton. Pure
    captions.ts       # JSON3 events to lines with word timing and search keys. Pure
    match.ts          # score, label, opposite check, player times. Pure
    relevance.ts      # does this video belong to this person. Pure
    compute.test.ts
  client.ts           # discover videos, fetch captions, speaker check
  handler.ts, index.ts
  README.md
backend/src/line-finder-ticker.ts # calls the collection route every minute
backend/src/db/types.ts           # the four Doc types and collection names

frontend/app/(protected)/line-finder/
  README.md  PRD.md  SEARCH_SPEC.md  TECHNICAL_ARCHITECTURE.md
  search/page.tsx, _components/, _hooks/
  people/page.tsx, _components/, _hooks/

frontend/app/actions/line-finder-actions.ts      # what the pages call
frontend/server/line-finder/
  collections.ts      # collections and their indexes
  people.ts           # counts and mapping
  collect.ts          # the collection worker
  search.ts           # candidates → score → results → state
frontend/app/api/line-finder/collect/run-due/route.ts  # only route: the ticker's, behind CRON_SECRET
```

## 3. Who does what

| Layer | Owns | Never does |
| --- | --- | --- |
| Pages and hooks | Drawing state, calling server actions | Talk to the backend or Mongo |
| `app/actions/line-finder-actions.ts` | Session, module access, admin checks, validation | Scrape |
| `frontend/server/line-finder/` | All Mongo reads and writes, search, the worker | Run in a browser |
| `backend/src/api/line-finder/` | YouTube, proxy, AI key, pure matching code | Touch Mongo |
| `backend/src/db/types.ts` | Collection names and Doc shapes | Hold logic |

So the browser only ever sees server actions, and the backend's address and secret stay on the server.

## 4. What is reused, and how

| Piece | Where it is today | For LineFinder |
| --- | --- | --- |
| Sign-in, membership, route guard | `server/auth`, `withRouteGuard` | Used as it is |
| Sidebar and path check | `sidebar-config-helpers.ts` | Used as it is |
| Page shell | `PageProvider`, `PageLayout`, `withPageHandler` | Used as it is |
| Actions | `runAuthenticatedAction`, `assertCallerIsAdmin` | Used as they are |
| Worker pattern | Content Lab's boards: ticker, `run-due`, lease | Same shape |
| YouTube search and channel listing | `fetchYoutubeSearch`, `fetchYoutubeChannel` | Called directly as services |
| Caption tracks | `transcript/fetch.ts` → `fetchPlayerCaptionTracks` | Called directly |
| Caption fetch | `fetchTimedTextJson3Raw`, split out so word timing survives | `compute/captions.ts` parses it |
| AI text calls | `media/groq-chat.ts` | Used for the speaker check |
| Proxy and spend cap | `createYoutubeFetchSession`, `evomi-budget.ts` | Used as they are. The cap is one of the stop reasons |

## 5. Storage

Everything is in Mongo, in the shared database. Shapes are in `backend/src/db/types.ts`, and indexes
sit beside the writers in `server/line-finder/collections.ts`.

| Collection | One per | Indexes |
| --- | --- | --- |
| `line_finder_people` | Person | `status, leaseUntil` |
| `line_finder_videos` | YouTube video, shared via `personIds` | `videoId` (unique); `personIds, status, views` |
| `line_finder_lines` | Caption line | `videoId, idx` (unique); `keys, videoId` |
| `line_finder_speaker_labels` | Moment | `personId, videoId, startMs` (unique) |

### How a line is found

Each line stores `keys`: the skeletons of its words and the next line's. A search gets the person's
finished videos, then:

```js
{ keys: { $in: queryKeys }, videoId: { $in: personsVideoIds } }
```

sorts by how many keys are shared, keeps the top 400, and scores those in code with `compute/match`.
Everyday words are left out of `queryKeys` unless they're all the query has.

`keys` is an array, so the index holds `videoId` rather than `personIds`: Mongo doesn't allow two array
fields in one compound index. A video's `personIds` stays on the video alone, so a video shared by
two people keeps one copy of its lines.

### Size

Measured on a real run of one person: 166 videos, 152 with captions, 92,890 lines. That used 18 MB of
storage and 13 MB of indexes, on a local Mongo.

| People, at this size each | Lines | Storage and indexes |
| --- | --- | --- |
| 5 | About 460,000 | About 155 MB |
| 50 | About 4.6 million | About 1.5 GB |

**The Atlas tier's storage limit hasn't been confirmed.** Check it before going past the first few people.
Meaning-based search and very large scale may need more later, and that decision waits for real numbers.

### Removing a person

Deletes the person and their labels, removes them from `personIds`, then deletes any video left with
no one, and that video's lines. `leads`-style sharing doesn't apply: nothing here is user data.

## 6. Backend routes

Stateless, all `POST`, under `ENDPOINTS.LINE_FINDER`, returning `ALApiResponse<T>`:

```text
/discover        { name, spellings, handle? }              → videos that name the person
/captions        { videoId }                               → outcome, lines when ok
/check-speaker   { person, title, channelName, context }   → likely | someone_else | unsure
```

## 7. Server actions

```text
listLineFinderPeople       anyone with Search          → people with progress
searchLineFinder           anyone with Search          → state, counts, results
addLineFinderPerson        admin                       → people
resumeLineFinderPerson     admin, retries failed       → people
removeLineFinderPerson     admin                       → people
markLineFinderSpeaker      admin                       → saved
```

## 8. Collection worker

- **Clock:** `backend/src/line-finder-ticker.ts` posts to `LINE_FINDER_COLLECT_URL` with `CRON_SECRET`
  every minute. Both env vars must be set, or collection is off.
- **Run:** `POST /api/line-finder/collect/run-due` claims one person with a lease, then works for up to 240
  seconds, 6 videos at once. The route's limit is 300 seconds.
- **Progress is in Mongo**, so a call ending or a deploy loses nothing. The next call continues.
- **Lines go in before the status changes**, and search only reads finished videos, so a half-saved video
  is never searched.
- **Stop rules** are in the search spec: 10 failures in a row, or the daily proxy limit.

## 9. Frontend

- **Search page:** a person `Select`, a line box, and results. Search runs on submit. State comes from the
  server, and the page only draws it.
- **Player:** a thumbnail and a play button. On click, an iframe from
  `youtube-nocookie.com/embed/ID?start=S&end=E&autoplay=1`. Videos that block embedding still have the
  YouTube link.
- **People page:** list with progress, polled every 5 seconds while someone is collecting.

## 10. Delivery order

1. `db/types.ts` module, submodules, collections and Docs; `app-config`, sidebar config, module helpers, flag.
2. `compute/*` with tests, including the worked examples from the search spec.
3. Backend routes, config and routes wiring, ticker.
4. `server/line-finder/`, actions, `run-due`.
5. Search and People pages.
6. 5 personalities, 100 searches, results table in `research/celebrity-clip-search/`.
7. Tenant record, DNS for `linefinder.aixellabs.in`, env vars, deploy.

## 11. Security and operations

- Every page goes through `withRouteGuard`, and every action checks access itself, because a `'use server'`
  export is a public endpoint.
- `run-due` is gated by `CRON_SECRET`, the same as boards.
- No user data in these collections. Marks store no user id in Phase 1.
- No footage is ever fetched. The backend module must not import `media/cut` or `youtube/download`.
- A proxy-spend cap of 1,500 MB a day applies, shared with everything else on the proxy.

### What uses the proxy

Only collection does. Searching reads Mongo and never touches YouTube.

| Step | Route | Why |
| --- | --- | --- |
| YouTube search for a person's videos | This host's IP, proxy only if refused | `withDirectFirst` |
| Video's caption list (`/player`) | Proxy | This host's IP gets `LOGIN_REQUIRED`. `X-Goog-FieldMask` keeps the reply to about 1.6 KB |
| Caption file (`timedtext`) | This host's IP, proxy only if refused | The link has `ip=0.0.0.0`, so it isn't tied to the proxy's IP |
| Own channel listing, if a handle is given | Proxy | Shared with other modules, once per person |

If YouTube starts refusing this host, `[youtube:line-finder-captions]` warnings appear in the logs and the
caption files go through the proxy, so the cost goes back up. Watch for that warning.
