import { promises as fs } from "node:fs";
import path from "node:path";

import { AIXEL_MEDIA } from "../../../media";
import type { MEDIA_UPLOAD_COMPLETE_RESPONSE, UPLOAD_SESSION_METADATA } from "./types";

/** In-progress sessions: sidecar `{uploadId}.json` + `{uploadId}.part`, so a restart never loses upload state. */
const UPLOAD_TMP_DIR = path.join(AIXEL_MEDIA.UPLOADS, ".tmp");

function metaPath(uploadId: string): string {
  return path.join(UPLOAD_TMP_DIR, `${uploadId}.json`);
}

function partPath(uploadId: string): string {
  return path.join(UPLOAD_TMP_DIR, `${uploadId}.part`);
}

async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(UPLOAD_TMP_DIR, { recursive: true });
  await fs.mkdir(AIXEL_MEDIA.UPLOADS, { recursive: true });
}

/** `init`: creates the sidecar metadata file and an empty (truncated) `.part` file. */
export async function createUploadSession(
  uploadId: string,
  metadata: UPLOAD_SESSION_METADATA,
): Promise<void> {
  await ensureUploadDirs();
  await fs.writeFile(metaPath(uploadId), JSON.stringify(metadata), "utf-8");
  // Create-or-truncate — a retried `init` for the same uploadId (won't happen
  // since uploadId is minted here, but keeps this idempotent) starts clean.
  const fh = await fs.open(partPath(uploadId), "w");
  await fh.close();
}

/** Reads the sidecar metadata; `null` if the session doesn't exist (expired/unknown uploadId). */
export async function readUploadMetadata(
  uploadId: string,
): Promise<UPLOAD_SESSION_METADATA | null> {
  try {
    const raw = await fs.readFile(metaPath(uploadId), "utf-8");
    return JSON.parse(raw) as UPLOAD_SESSION_METADATA;
  } catch {
    return null;
  }
}

/** Current size of the `.part` file; `null` if it doesn't exist. */
export async function getPartFileSize(uploadId: string): Promise<number | null> {
  try {
    const stat = await fs.stat(partPath(uploadId));
    return stat.size;
  } catch {
    return null;
  }
}

/**
 * Writes `buffer` into the `.part` file at exactly `offset` using a
 * positional write (not append) — idempotent for repeated retries of the
 * same offset+bytes, and safe regardless of what order chunks arrive in.
 * Returns the `.part` file's size after the write.
 */
export async function writeChunk(
  uploadId: string,
  offset: number,
  buffer: Buffer,
): Promise<number> {
  const fh = await fs.open(partPath(uploadId), "r+");
  try {
    await fh.write(buffer, 0, buffer.length, offset);
    const stat = await fh.stat();
    return stat.size;
  } finally {
    await fh.close();
  }
}

/**
 * `complete`: moves the finished `.part` file to its final resting place
 * under `AIXEL_MEDIA.UPLOADS`, disambiguating a filename collision by
 * inserting `-{first 8 chars of uploadId}` before the extension, then
 * deletes the sidecar files. Caller has already verified `.part` size
 * matches the expected size.
 */
export async function finalizeUpload(
  uploadId: string,
  metadata: UPLOAD_SESSION_METADATA,
): Promise<MEDIA_UPLOAD_COMPLETE_RESPONSE> {
  const finalFilename = await resolveCollisionFreeFilename(metadata.filename, uploadId);
  const finalPath = path.join(AIXEL_MEDIA.UPLOADS, finalFilename);

  await fs.rename(partPath(uploadId), finalPath);
  await deleteSidecars(uploadId);

  return { path: finalPath, filename: finalFilename, size: metadata.size };
}

/** `video.mp4` -> `video-a1b2c3d4.mp4` (first 8 chars of uploadId) when the plain name already exists. */
async function resolveCollisionFreeFilename(
  filename: string,
  uploadId: string,
): Promise<string> {
  const target = path.join(AIXEL_MEDIA.UPLOADS, filename);
  const exists = await fs
    .access(target)
    .then(() => true)
    .catch(() => false);
  if (!exists) return filename;

  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const uploadIdPrefix = uploadId.slice(0, 8);
  return `${base}-${uploadIdPrefix}${ext}`;
}

async function deleteSidecars(uploadId: string): Promise<void> {
  await Promise.all([
    fs.rm(metaPath(uploadId), { force: true }),
    fs.rm(partPath(uploadId), { force: true }),
  ]);
}
