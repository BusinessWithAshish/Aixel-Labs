const BROWSER_WORKER_URL =
  process.env.BROWSER_WORKER_URL ?? "http://localhost:8080";

// ── Shared types (mirror browser-worker's handler types) ──────────────────────

export type GSEARCH_RESPONSE = {
  url: string | null;
  title: string | null;
  snippet: string | null;
  index: number | null;
};

export type GSEARCH_REQUEST = {
  searchQuery: string;
  pages: number;
  country: string;
  city?: string;
  timeFilter?: string;
  language?: string;
};

// ── Shared constants ──────────────────────────────────────────────────────────

export const DEFAULT_GSEARCH_MAX_PAGES = 25;

export const GOOGLE_SEARCH_QUERY_LIMITS = {
  maxQueryChars: 1900,
  maxQueryWords: 30,
};

// ── fetchGSearch — same signature as before, now delegates to browser-worker ──

export async function fetchGSearch(
  props: GSEARCH_REQUEST,
): Promise<GSEARCH_RESPONSE[]> {
  const response = await fetch(`${BROWSER_WORKER_URL}/gsearch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(props),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[BrowserWorker] fetchGSearch failed: HTTP ${response.status} — ${text}`,
    );
  }

  const json = (await response.json()) as {
    success: boolean;
    data?: GSEARCH_RESPONSE[];
    error?: string;
  };

  if (!json.success || !json.data) {
    throw new Error(
      `[BrowserWorker] fetchGSearch error: ${json.error ?? "Unknown error"}`,
    );
  }

  return json.data;
}
