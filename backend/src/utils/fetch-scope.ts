import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Every scrape fetch in this process takes a slot here (`createUrlFetchSession` does it for
 * its callers), proxied or direct. node-tls-client runs each request on one of a fixed set
 * of worker threads (2 x CPUs, 8 on the VPS) behind a first-come queue, so without this one
 * big crawl makes everyone wait and cancelled work still runs. Stays under the thread count
 * so a session's close and memory free never queue behind fetches.
 */
const MAX_OUTBOUND_FETCHES = Number(process.env.MAX_OUTBOUND_FETCHES) || 6;

type FetchScope = {
  waiting: { start: () => void; stop: (reason: Error) => void }[];
  signal?: AbortSignal;
  holdsSlot?: boolean;
};

const scopes = new AsyncLocalStorage<FetchScope>();
/** Work outside any request (timers, boot) shares one turn. */
const backgroundScope: FetchScope = { waiting: [] };
/** Scopes with a fetch waiting. A scope served goes to the back, so slots rotate between them. */
const turns = new Set<FetchScope>();
let activeFetches = 0;

export class FetchAbortedError extends Error {
  constructor() {
    super("Request cancelled or timed out");
    this.name = "FetchAbortedError";
  }
}

function startWaiting(): void {
  while (activeFetches < MAX_OUTBOUND_FETCHES) {
    const [scope] = turns;
    if (!scope) return;
    turns.delete(scope);
    const next = scope.waiting.shift()!;
    if (scope.waiting.length > 0) turns.add(scope);
    activeFetches++;
    next.start();
  }
}

/** Fetches made inside `fn` count as one party. Once `signal` aborts they refuse to run. */
export function runInFetchScope<T>(fn: () => T, signal?: AbortSignal): T {
  const scope: FetchScope = { waiting: [], signal };
  signal?.addEventListener(
    "abort",
    () => {
      turns.delete(scope);
      for (const { stop } of scope.waiting.splice(0)) stop(new FetchAbortedError());
    },
    { once: true },
  );
  return scopes.run(scope, fn);
}

/**
 * Runs `fetch` once a slot is free. Wrap a caller's own timeout in this, so that time spent
 * in line does not count against it; a session used inside then takes no second slot.
 */
export async function withFetchSlot<T>(fetch: () => Promise<T>): Promise<T> {
  const scope = scopes.getStore() ?? backgroundScope;
  if (scope.holdsSlot) return fetch();
  if (scope.signal?.aborted) throw new FetchAbortedError();

  await new Promise<void>((start, stop) => {
    scope.waiting.push({ start, stop });
    turns.add(scope);
    startWaiting();
  });
  try {
    return await scopes.run({ ...scope, holdsSlot: true }, fetch);
  } finally {
    activeFetches--;
    startWaiting();
  }
}
