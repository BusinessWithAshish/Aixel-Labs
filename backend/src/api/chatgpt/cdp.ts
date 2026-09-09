/**
 * Minimal Chrome DevTools Protocol client for the VPS ChatGPT Chrome.
 * Port of sova/skills/chatgpt/cdp.py
 */
import { spawn, type ChildProcess } from "node:child_process";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { fetch } from "undici";
import WebSocket from "ws";

import { CHATGPT } from "./constants";

type CdpTarget = {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type CdpMessage = {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { message?: string; code?: number };
  params?: Record<string, unknown>;
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
        wait.reject(
          new Error(msg.error.message || `CDP error code ${msg.error.code}`),
        );
        return;
      }
      wait.resolve(msg.result || {});
    });
  }

  static async connect(wsUrl: string): Promise<CdpTab> {
    const ws = new WebSocket(wsUrl, {
      maxPayload: CHATGPT.CDP_MAX_PAYLOAD_BYTES,
      handshakeTimeout: CHATGPT.CDP_CONNECT_TIMEOUT_MS,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("CDP WebSocket connect timeout")),
        CHATGPT.CDP_CONNECT_TIMEOUT_MS,
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
    timeoutMs: number = CHATGPT.CDP_EVAL_TIMEOUT_MS,
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
    const timeoutMs = opts.timeoutMs ?? CHATGPT.CDP_EVAL_TIMEOUT_MS;
    const result = await this.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: !!opts.awaitPromise,
      },
      timeoutMs,
    );
    const exceptionDetails = result.exceptionDetails as
      | { text?: string }
      | undefined;
    if (exceptionDetails) {
      const desc =
        (result.result as { description?: string } | undefined)?.description ||
        "";
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

/**
 * Best-effort: a Chrome from a crashed/killed prior run may still be holding
 * the debug port + profile-dir lock. Ask it to quit cleanly via CDP before
 * spawning a fresh one on the same port/profile. No-ops when nothing is
 * listening (the normal case — the prior run's `closeChatGptChrome` already
 * tore it down).
 */
async function closeAnyExistingChrome(): Promise<void> {
  let info: { webSocketDebuggerUrl?: string };
  try {
    const res = await fetch(`${CHATGPT.CDP_HTTP}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return;
    info = (await res.json()) as { webSocketDebuggerUrl?: string };
  } catch {
    return; // nothing listening — normal case
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
  // Give the process a moment to actually release the port + profile lock.
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * Chrome writes SingletonLock/SingletonCookie/SingletonSocket into the
 * profile dir on startup but doesn't reliably remove them on a SIGTERM-based
 * exit (only a clean UI-initiated quit is guaranteed to) — verified live
 * 2026-09-07: a killed process left SingletonLock pointing at a dead PID,
 * and the next launch silently deferred to it and exited immediately
 * without ever opening a CDP port. Safe to clear unconditionally here: this
 * runs only after closeAnyExistingChrome() has confirmed no CDP endpoint is
 * reachable, so any lock files that exist are provably stale.
 */
async function clearStaleSingletonFiles(): Promise<void> {
  await Promise.all(
    ["SingletonLock", "SingletonCookie", "SingletonSocket"].map((name) =>
      unlink(join(CHATGPT.PROFILE_DIR, name)).catch(() => {
        /* fine if it doesn't exist */
      }),
    ),
  );
}

export type ChromeHandle = { proc: ChildProcess };

/**
 * Spawns a fresh headless Chrome against the persistent profile dir
 * (CHATGPT.PROFILE_DIR) and waits for its CDP port to come up. The process
 * is exclusive to one `generateChatGpt()`/health call — `busy` in client.ts
 * ensures only one is ever alive at a time, so there's no port/profile
 * contention. Login state (cookies) lives in the profile dir, not the
 * process, so it survives every spawn/close cycle.
 */
export async function launchChatGptChrome(): Promise<ChromeHandle> {
  await closeAnyExistingChrome();
  await clearStaleSingletonFiles();

  const port = new URL(CHATGPT.CDP_HTTP).port || "9222";
  const proc = spawn(
    CHATGPT.CHROME_BIN,
    [
      // Headed on purpose — see CHATGPT.DISPLAY doc comment (headless gets
      // walled by Cloudflare even with valid session cookies).
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-allow-origins=*",
      `--user-data-dir=${CHATGPT.PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--no-sandbox",
      "--window-size=1440,900",
    ],
    { stdio: "ignore", env: { ...process.env, DISPLAY: CHATGPT.DISPLAY } },
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

  const deadline = Date.now() + CHATGPT.CDP_LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (earlyExit) {
      detach();
      throw earlyExit;
    }
    try {
      const res = await fetch(`${CHATGPT.CDP_HTTP}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        detach();
        return { proc };
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, CHATGPT.CDP_LAUNCH_POLL_MS));
  }
  detach();
  const timeoutErr = new Error(
    `Chrome CDP did not come up within ${CHATGPT.CDP_LAUNCH_TIMEOUT_MS}ms`,
  );
  try {
    proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  throw timeoutErr;
}

/** Graceful SIGTERM, SIGKILL after a grace period if it won't die. */
export async function closeChatGptChrome(handle: ChromeHandle): Promise<void> {
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

/** Creates an isolated tab via the native Chrome DevTools HTTP API and attaches to it. */
export async function openNewTab(
  cdpHttp: string,
  url = "about:blank",
): Promise<CdpTab> {
  const res = await fetch(`${cdpHttp}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`CDP /json/new HTTP ${res.status}`);
  }
  const target = (await res.json()) as CdpTarget;
  if (!target.webSocketDebuggerUrl) {
    throw new Error("CDP /json/new returned no webSocketDebuggerUrl");
  }
  return CdpTab.connect(target.webSocketDebuggerUrl);
}
