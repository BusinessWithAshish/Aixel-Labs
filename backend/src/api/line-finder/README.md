# LineFinder API

Finds a person's videos and fetches their captions. Product docs are in
[`frontend/app/(protected)/line-finder/`](../../../../frontend/app/(protected)/line-finder/README.md);
matching rules are in its `SEARCH_SPEC.md`.

Stateless, like every module here: no Mongo. Saving, searching and the collection
worker live in `frontend/server/line-finder/`. Shapes live in `backend/src/db/types.ts`.

## Endpoints

All `POST`, under `/line-finder`, returning `ALApiResponse<T>`.

| Route | Body | Returns |
| --- | --- | --- |
| `/discover` | `{ name, spellings?, handle? }` | `{ videos }`: videos that name the person, plus their own channel's |
| `/captions` | `{ videoId }` | `{ outcome }`, and lines with word timing and search keys when `ok` |
| `/check-speaker` | `{ person, title, channelName, context }` | `{ speaker }`: `likely`, `someone_else` or `unsure` |

`/captions` answers 200 for `no_captions`, `failed` and `budget`, so the worker can decide what to
do about each.

## Architecture

```
line-finder/
├── constants.ts     # routes, limits, labels, messages
├── schemas.ts       # Zod requests, including those the server actions validate
├── types.ts         # responses and what the pages draw
├── compute/         # pure: sound forms, caption parsing, matching, relevance
├── client.ts        # discover, captions, speaker check
├── handler.ts
└── index.ts
```

`compute/match` and `compute/sound` are exported to the frontend, which runs the search.

This module fetches captions only. It must never import `media/cut` or `youtube/download`.

## Tests

```bash
cd backend && node --import tsx --test src/api/line-finder/compute/compute.test.ts
```

## Smoke

```bash
curl -s -X POST localhost:8002/line-finder/captions -H 'content-type: application/json' \
  -d '{"videoId":"x1HWOk0vk2o"}'
```
