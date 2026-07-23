"use client";

import { useEffect, useRef } from "react";

const DEFAULT_CONCURRENCY = 10;

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Prefetch same-origin proxied Instagram avatar URLs into the browser image
 * cache with bounded parallelism so virtualized grids don't wait until scroll.
 *
 * Uses `new Image()` (not `fetch`) so the HTTP/image cache is shared with
 * subsequent `<img>` / Avatar loads.
 */
export function usePrefetchImageUrls(
  urls: readonly string[],
  concurrency = DEFAULT_CONCURRENCY,
) {
  const key = urls.join("\0");
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  useEffect(() => {
    if (urls.length === 0) return;

    let cancelled = false;
    const list = [...urls];
    let cursor = 0;

    async function worker() {
      while (!cancelled && cursor < list.length) {
        const index = cursor++;
        const url = list[index]!;
        await preloadImage(url);
      }
    }

    const n = Math.min(concurrency, list.length);
    void Promise.all(Array.from({ length: n }, () => worker()));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes url list
  }, [key, concurrency]);
}
