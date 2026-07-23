"use client";

/**
 * Session-scoped Instagram avatar loader.
 *
 * Why not `<img src={cdnUrl}>`? IG/FB CDN sends `Cross-Origin-Resource-Policy:
 * same-origin`, which Chrome blocks for cross-site embedding.
 *
 * Why not stampede `/api/instagram/image`? A global semaphore + in-memory blob
 * cache keeps concurrency low (virtualized grids) and avoids repeat proxy hits
 * when scrolling back.
 */

const MAX_CONCURRENT = 6;

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let active = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      active++;
      resolve();
    });
  });
}

function release() {
  active = Math.max(0, active - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function proxyUrlFor(cdnUrl: string): string {
  return `/api/instagram/image?url=${encodeURIComponent(cdnUrl)}`;
}

/**
 * Returns a same-origin `blob:` URL for the avatar (cached for the session).
 */
export async function loadInstagramAvatarBlobUrl(cdnUrl: string): Promise<string> {
  const cached = blobCache.get(cdnUrl);
  if (cached) return cached;

  const pending = inflight.get(cdnUrl);
  if (pending) return pending;

  const task = (async () => {
    await acquire();
    try {
      const res = await fetch(proxyUrlFor(cdnUrl), {
        credentials: "same-origin",
        // Browser HTTP cache + our Cache-Control on the route.
        cache: "force-cache",
      });
      if (!res.ok) {
        throw new Error(`avatar proxy HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobCache.set(cdnUrl, objectUrl);
      return objectUrl;
    } finally {
      inflight.delete(cdnUrl);
      release();
    }
  })();

  inflight.set(cdnUrl, task);
  return task;
}
