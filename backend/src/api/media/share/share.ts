import { randomUUID } from "node:crypto";
import { copyFile, realpath, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";

import sharp from "sharp";

import { assertPersistentDisk } from "../../../config";
import { AIXEL_MEDIA } from "../../../media";
import { MEDIA_ERROR_MESSAGES, MEDIA_SHARE } from "../constants";
import type { MEDIA_SHARE_REQUEST, MEDIA_SHARE_RESPONSE } from "./types";

/**
 * Copy a private media file to the public dir under an unguessable name and
 * return its URL. This is the one way to hand a file to an external service
 * that can only fetch by URL (Composio uploads, Instagram containers).
 * Only files already under the private media root qualify, so the op cannot
 * be used to publish arbitrary host files.
 */
export async function shareMedia(input: MEDIA_SHARE_REQUEST): Promise<MEDIA_SHARE_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
  const privateRoot = await realpath(AIXEL_MEDIA.PRIVATE);
  let resolved: string;
  try {
    resolved = await realpath(input.path);
  } catch {
    throw new Error(`${MEDIA_ERROR_MESSAGES.SHARE_NOT_FOUND}: ${input.path}`);
  }
  if (!resolved.startsWith(privateRoot + sep)) {
    throw new Error(`${MEDIA_ERROR_MESSAGES.SHARE_OUTSIDE_ROOT} (${privateRoot}/)`);
  }
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error(`${MEDIA_ERROR_MESSAGES.SHARE_NOT_A_FILE}: ${input.path}`);

  const ext = extname(resolved).toLowerCase();
  const toJpeg = input.format === "jpeg" && ext !== ".jpg" && ext !== ".jpeg";
  if (toJpeg && ext !== ".png" && ext !== ".webp") {
    throw new Error(`${MEDIA_ERROR_MESSAGES.SHARE_NOT_AN_IMAGE}: ${input.path}`);
  }
  const name = `${randomUUID()}${toJpeg ? ".jpg" : ext}`;
  const publicPath = join(MEDIA_SHARE.PUBLIC_DIR, name);
  if (toJpeg) {
    // Flatten first: a transparent PNG would otherwise come out with black where it was clear.
    await sharp(resolved).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toFile(publicPath);
  } else {
    await copyFile(resolved, publicPath);
  }
  const bytes = toJpeg ? (await stat(publicPath)).size : info.size;
  return {
    url: `${MEDIA_SHARE.PUBLIC_BASE_URL}/${name}`,
    publicPath,
    bytes,
    retentionDays: MEDIA_SHARE.PUBLIC_RETENTION_DAYS,
  };
}
