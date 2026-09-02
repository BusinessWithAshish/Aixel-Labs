/**
 * Minimal Chrome DevTools Protocol client for the VPS headful ChatGPT Chrome.
 * Port of sova/skills/chatgpt/cdp.py
 */
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

export async function listCdpTargets(): Promise<CdpTarget[]> {
  const res = await fetch(`${CHATGPT.CDP_HTTP}/json/list`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`CDP /json/list HTTP ${res.status}`);
  }
  return (await res.json()) as CdpTarget[];
}

export async function attachChatGptTab(
  substr = "chatgpt.com",
): Promise<CdpTab> {
  const targets = await listCdpTargets();
  const tab = targets.find(
    (t) => t.type === "page" && (t.url || "").includes(substr),
  );
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error(
      `No open tab matching ${JSON.stringify(substr)}. Open ChatGPT in the VNC browser.`,
    );
  }
  return CdpTab.connect(tab.webSocketDebuggerUrl);
}
