/**
 * Minimal Chrome DevTools Protocol client + browser lifecycle for the Gemini
 * headful Chrome. Structurally the same approach as the chatgpt module's
 * cdp.ts, but self-contained and keyed to GEMINI constants so the two modules
 * spawn fully independent browsers (own port, own profile dir) and never
 * contend for a shared lock. Adds one-time profile seeding from an existing
 * logged-in Chrome profile.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { fetch } from "undici";
import WebSocket from "ws";

import { GEMINI } from "./constants";

type CdpTarget = { webSocketDebuggerUrl?: string };

type CdpMessage = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string; code?: number };
};

export class CdpTab {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on("message", (raw) => {
      let msg: CdpMessage;
      try {
        msg = JSON.parse(String(raw)) as CdpMessage;
      } catch {
        return;
      }
      if (msg.id == null) return;
      const wait = this.pending.get(msg.id);
      if (!wait) return;
      clearTimeout(wait.timer);
      this.pending.delete(msg.id);
      if (msg.error) {
        wait.reject(new Error(msg.error.message || `CDP error code ${msg.error.code}`));
        return;
      }
      wait.resolve(msg.result || {});
    });
  }

  static async connect(wsUrl: string): Promise<CdpTab> {
    const ws = new WebSocket(wsUrl, {
      maxPayload: GEMINI.CDP_MAX_PAYLOAD_BYTES,
      handshakeTimeout: GEMINI.CDP_CONNECT_TIMEOUT_MS,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("CDP WebSocket connect timeout")),
        GEMINI.CDP_CONNECT_TIMEOUT_MS,
      );
      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return new CdpTab(ws);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = GEMINI.CDP_EVAL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async js(
    expression: string,
    opts: { timeoutMs?: number; awaitPromise?: boolean } = {},
  ): Promise<unknown> {
    const timeoutMs = opts.timeoutMs ?? GEMINI.CDP_EVAL_TIMEOUT_MS;
    const result = await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: !!opts.awaitPromise },
      timeoutMs,
    );
    const exceptionDetails = result.exceptionDetails as { text?: string } | undefined;
    if (exceptionDetails) {
      const desc = (result.result as { description?: string } | undefined)?.description || "";
      throw new Error(`JS error: ${exceptionDetails.text || ""} ${desc}`.trim());
    }
    return (result.result as { value?: unknown } | undefined)?.value;
  }

  close(): void {
    for (const [, wait] of this.pending) {
      clearTimeout(wait.timer);
      wait.reject(new Error("CDP tab closed"));
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

/** Ask any Chrome already holding GEMINI.CDP_HTTP to quit cleanly. No-op when nothing listens. */
async function closeAnyExistingChrome(): Promise<void> {
  let info: { webSocketDebuggerUrl?: string };
  try {
    const res = await fetch(`${GEMINI.CDP_HTTP}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return;
    info = (await res.json()) as { webSocketDebuggerUrl?: string };
  } catch {
    return;
  }
  if (!info.webSocketDebuggerUrl) return;
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(info.webSocketDebuggerUrl!);
    const done = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    ws.once("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      setTimeout(done, 500);
    });
    ws.once("error", done);
  });
  await new Promise((r) => setTimeout(r, 1000));
}

/** Clear stale singleton lock files a killed prior run may have left in the profile dir. */
async function clearStaleSingletonFiles(): Promise<void> {
  await Promise.all(
    ["SingletonLock", "SingletonCookie", "SingletonSocket"].map((name) =>
      unlink(join(GEMINI.PROFILE_DIR, name)).catch(() => {
        /* fine if absent */
      }),
    ),
  );
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * One-time: if the Gemini profile dir has no `Default` yet, seed it from
 * SEED_PROFILE_DIR by copying `Local State` + `Default` (where cookies /
 * login live). After this the Gemini profile is fully independent of the
 * source. Idempotent — skips entirely once seeded.
 */
export async function ensureGeminiProfileSeeded(): Promise<void> {
  if (await dirExists(join(GEMINI.PROFILE_DIR, "Default"))) return;
  if (!(await dirExists(GEMINI.SEED_PROFILE_DIR))) {
    throw new Error(
      `Gemini profile not seeded and seed source missing: ${GEMINI.SEED_PROFILE_DIR}`,
    );
  }
  await mkdir(GEMINI.PROFILE_DIR, { recursive: true });
  await cp(join(GEMINI.SEED_PROFILE_DIR, "Local State"), join(GEMINI.PROFILE_DIR, "Local State"), {
    force: true,
  }).catch(() => {
    /* Local State is optional */
  });
  await cp(join(GEMINI.SEED_PROFILE_DIR, "Default"), join(GEMINI.PROFILE_DIR, "Default"), {
    recursive: true,
    force: true,
  });
  // Never carry a source lock into the fresh copy.
  await Promise.all(
    ["SingletonLock", "SingletonCookie", "SingletonSocket"].map((name) =>
      rm(join(GEMINI.PROFILE_DIR, name), { force: true }).catch(() => {}),
    ),
  );
}

export type ChromeHandle = { proc: ChildProcess };

/** Spawn a fresh headed Chrome for Gemini against PROFILE_DIR and wait for its CDP port. */
export async function launchGeminiChrome(): Promise<ChromeHandle> {
  await ensureGeminiProfileSeeded();
  await closeAnyExistingChrome();
  await clearStaleSingletonFiles();

  const port = new URL(GEMINI.CDP_HTTP).port || "9333";
  const proc = spawn(
    GEMINI.CHROME_BIN,
    [
      // Headed on purpose — headless is walled by Cloudflare even with valid cookies.
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-allow-origins=*",
      `--user-data-dir=${GEMINI.PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--no-sandbox",
      "--window-size=1440,900",
    ],
    { stdio: "ignore", env: { ...process.env, DISPLAY: GEMINI.DISPLAY } },
  );

  let earlyExit: Error | null = null;
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    earlyExit = new Error(`Chrome exited early (code=${code}, signal=${signal})`);
  };
  const onError = (err: Error) => {
    earlyExit = err;
  };
  proc.once("exit", onExit);
  proc.once("error", onError);
  const detach = () => {
    proc.removeListener("exit", onExit);
    proc.removeListener("error", onError);
  };

  const deadline = Date.now() + GEMINI.CDP_LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (earlyExit) {
      detach();
      throw earlyExit;
    }
    try {
      const res = await fetch(`${GEMINI.CDP_HTTP}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        detach();
        return { proc };
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, GEMINI.CDP_LAUNCH_POLL_MS));
  }
  detach();
  try {
    proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  throw new Error(`Chrome CDP did not come up within ${GEMINI.CDP_LAUNCH_TIMEOUT_MS}ms`);
}

/** Graceful SIGTERM, SIGKILL after a grace period. */
export async function closeGeminiChrome(handle: ChromeHandle): Promise<void> {
  const proc = handle.proc;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 5000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Create an isolated tab via the DevTools HTTP API and attach to it. */
export async function openNewTab(cdpHttp: string, url = "about:blank"): Promise<CdpTab> {
  const res = await fetch(`${cdpHttp}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CDP /json/new HTTP ${res.status}`);
  const target = (await res.json()) as CdpTarget;
  if (!target.webSocketDebuggerUrl) throw new Error("CDP /json/new returned no webSocketDebuggerUrl");
  return CdpTab.connect(target.webSocketDebuggerUrl);
}
