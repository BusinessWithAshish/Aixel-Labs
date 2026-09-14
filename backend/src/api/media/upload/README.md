# Chunked upload (`/media/upload/*`)

Lets a client drop a local file and have it land on this backend's persistent
disk (`AIXEL_MEDIA.UPLOADS` — see `src/media.ts`) in chunks, resumable across a
backend restart/redeploy because every in-progress session is tracked by files
on disk (a sidecar JSON + a `.part` file under `AIXEL_MEDIA.UPLOADS/.tmp/`),
not in-memory state.

Guarded by `assertPersistentDisk` — refuses (501) on Vercel, works only on a
persistent host (VPS / local dev with a writable `AIXEL_MEDIA_ROOT`).

Four routes, all under the existing `/media` mount:

| Method | Path | Body | Auth |
|---|---|---|---|
| `POST` | `/media/upload/init` | JSON | none |
| `PUT` | `/media/upload/:uploadId/chunk` | raw `application/octet-stream` | `Authorization: Bearer {token}` + `X-Chunk-Offset` |
| `GET` | `/media/upload/:uploadId/status` | — | `Authorization: Bearer {token}` |
| `POST` | `/media/upload/:uploadId/complete` | — | `Authorization: Bearer {token}` |

## Token

`token = "{uploadId}.{exp}.{sigBase64Url}"` — HMAC-SHA256 over `"{uploadId}.{exp}"`,
keyed by `AIXEL_UPLOAD_SECRET` (`node:crypto`, no dependency). `exp` is a
unix-ms timestamp 6 hours after `init`. Verified with `crypto.timingSafeEqual`
(constant-time) on every chunk/status/complete call — see `token.ts`.

## 1. `POST /media/upload/init`

```jsonc
// request
{ "filename": "clip.mp4", "size": 20971520, "mimeType": "video/mp4" } // mimeType optional
```

```jsonc
// 200 — ALApiResponse<{ uploadId, token, chunkSize }>
{ "success": true, "data": { "uploadId": "…", "token": "…", "chunkSize": 8388608 } }
```

Writes `{AIXEL_MEDIA.UPLOADS}/.tmp/{uploadId}.json` (sidecar metadata) and an
empty `{uploadId}.part`.

## 2. `PUT /media/upload/:uploadId/chunk`

Headers: `Authorization: Bearer {token}`, `X-Chunk-Offset: {decimal byte offset}`.
Body: raw chunk bytes.

Writes the bytes into the `.part` file at exactly that offset (positional
write via `fs.promises.open(path, "r+")`, not append) — safe to retry the same
offset+bytes twice, and order-independent.

```jsonc
// 200 — ALApiResponse<{ bytesReceived }>  (current .part file size after the write)
{ "success": true, "data": { "bytesReceived": 8388608 } }
```

## 3. `GET /media/upload/:uploadId/status`

```jsonc
// 200 — ALApiResponse<{ bytesReceived, size, complete }>
{ "success": true, "data": { "bytesReceived": 8388608, "size": 20971520, "complete": false } }
```

404 (`ALApiResponse<never>`, `success: false`) if the sidecar/`.part` don't
exist (unknown/expired `uploadId`).

## 4. `POST /media/upload/:uploadId/complete`

Verifies `.part` size === `size` from the sidecar (400 if not — upload the
missing chunks first). Moves `.part` to `{AIXEL_MEDIA.UPLOADS}/{filename}`,
disambiguating a name collision by inserting `-{first 8 chars of uploadId}`
before the extension (`video.mp4` -> `video-a1b2c3d4.mp4`). Deletes the
sidecar files.

```jsonc
// 200 — ALApiResponse<{ path, filename, size }>
{ "success": true, "data": { "path": "/home/ubuntu/media/private/uploads/clip.mp4", "filename": "clip.mp4", "size": 20971520 } }
```

## Smoke test

```bash
cd backend
echo -n "hello chunked upload" > /tmp/upload-smoke.txt
SIZE=$(stat -c%s /tmp/upload-smoke.txt)

INIT=$(curl -s -X POST http://127.0.0.1:8099/media/upload/init \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"upload-smoke.txt\",\"size\":$SIZE}")
UPLOAD_ID=$(node -e "console.log(JSON.parse(process.argv[1]).data.uploadId)" "$INIT")
TOKEN=$(node -e "console.log(JSON.parse(process.argv[1]).data.token)" "$INIT")

curl -s -X PUT "http://127.0.0.1:8099/media/upload/$UPLOAD_ID/chunk" \
  -H "Authorization: Bearer $TOKEN" -H "X-Chunk-Offset: 0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/upload-smoke.txt

curl -s "http://127.0.0.1:8099/media/upload/$UPLOAD_ID/status" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST "http://127.0.0.1:8099/media/upload/$UPLOAD_ID/complete" \
  -H "Authorization: Bearer $TOKEN"
```
