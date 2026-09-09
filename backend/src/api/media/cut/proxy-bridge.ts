import { createServer, connect as netConnect, type Server, type Socket } from "node:net";

/**
 * Tiny local HTTP CONNECT proxy bridge.
 *
 * Why this exists: ffmpeg's `-http_proxy` option parses credentials from
 * the proxy URL but does NOT send them as a `Proxy-Authorization` header
 * on the `CONNECT` request (confirmed by capturing ffmpeg's bytes — the
 * CONNECT goes out with only `Host` + `Connection`, no auth). Evomi's
 * residential proxy rejects an unauthenticated CONNECT with `403`. undici's
 * `ProxyAgent` (used by the InnerTube client) does send the header, which is
 * why the stream-URL fetch works but ffmpeg's stream fetch doesn't.
 *
 * This bridge listens on a local port; ffmpeg points `-http_proxy` at it
 * (no credentials there). For each `CONNECT host:port` ffmpeg sends, the
 * bridge opens a TCP connection to the upstream Evomi proxy and re-issues
 * the `CONNECT` WITH the `Proxy-Authorization: Basic …` header, then tunnels
 * bytes both ways once Evomi returns `200`. ffmpeg's HTTP range requests
 * then flow through Evomi authenticated, so only the clip segment transits
 * the residential proxy — the stream-direct bandwidth win is preserved
 * without ffmpeg ever needing to know Evomi's credentials.
 *
 * One bridge per clip job (started in `cut.ts` for the youtube kind,
 * stopped in `finally`); all clips in the job share it.
 */
export class ProxyConnectBridge {
  private server: Server;
  private port = 0;
  private sockets = new Set<Socket>();

  constructor(
    private upstreamHost: string,
    private upstreamPort: number,
    private proxyAuthorization: string,
  ) {
    this.server = createServer((client) => this.handle(client));
    this.server.on("connection", (s) => {
      this.sockets.add(s);
      s.on("close", () => this.sockets.delete(s));
    });
  }

  async start(): Promise<number> {
    await new Promise<void>((res, rej) => {
      this.server.once("error", rej);
      this.server.listen(0, "127.0.0.1", () => res());
    });
    this.port = (this.server.address() as { port: number }).port;
    return this.port;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((res) => this.server.close(() => res())).catch(() => {});
  }

  /** `http://127.0.0.1:<port>` — the value to pass to ffmpeg's `-http_proxy`. */
  get localProxyUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private handle(client: Socket): void {
    let head = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      head = Buffer.concat([head, chunk]);
      const sep = head.indexOf("\r\n\r\n");
      if (sep === -1) return;
      client.removeListener("data", onData);
      const headStr = head.slice(0, sep).toString();
      const leftover = head.slice(sep + 4);
      const match = headStr.match(/^CONNECT (\S+) HTTP\/1\.1/);
      if (!match) {
        client.destroy();
        return;
      }
      this.tunnel(client, match[1], leftover);
    };
    client.on("data", onData);
    client.on("error", () => {});
  }

  private tunnel(client: Socket, target: string, leftover: Buffer): void {
    const upstream = netConnect(this.upstreamPort, this.upstreamHost);
    let upBuf = Buffer.alloc(0);
    let established = false;

    const cleanup = (): void => {
      client.destroy();
      upstream.destroy();
    };
    upstream.on("error", cleanup);
    client.on("error", cleanup);

    upstream.on("connect", () => {
      upstream.write(
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${this.proxyAuthorization}\r\n\r\n`,
      );
    });

    upstream.on("data", (chunk: Buffer) => {
      if (established) {
        client.write(chunk);
        return;
      }
      upBuf = Buffer.concat([upBuf, chunk]);
      const sep = upBuf.indexOf("\r\n\r\n");
      if (sep === -1) return;
      const statusLine = upBuf.slice(0, sep).toString().split("\r\n")[0];
      if (!/ 200 /.test(statusLine)) {
        client.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        client.end();
        upstream.destroy();
        return;
      }
      established = true;
      client.write("HTTP/1.1 200 Connection established\r\n\r\n");
      const rest = upBuf.slice(sep + 4);
      if (rest.length) client.write(rest);
      if (leftover.length) upstream.write(leftover);
      // The original `upstream.on("data")` handler above already forwards
      // post-establishment chunks via its `if (established)` branch — do NOT
      // add a second upstream data handler (would double-write and corrupt
      // the TLS stream). Only wire the client→upstream direction here, since
      // the client's initial head handler was removed.
      client.on("data", (d) => upstream.write(d));
      client.on("end", () => upstream.end());
      upstream.on("end", () => client.end());
    });
  }
}

/**
 * Parse `http://user:pass@host:port` into the pieces the bridge needs:
 * the upstream host/port and the `Basic base64(user:pass)` auth header.
 * Returns `null` if the URL isn't a usable http proxy URL with credentials.
 */
export function parseProxyUrlForBridge(
  proxyUrl: string,
): { host: string; port: number; proxyAuthorization: string } | null {
  const match = proxyUrl.match(
    /^https?:\/\/([^:@/]+):([^@/]+)@([^:/]+):(\d+)(?:\/.*)?$/,
  );
  if (!match) return null;
  const [, user, pass, host, portStr] = match;
  const port = Number(portStr);
  if (!Number.isFinite(port) || port <= 0) return null;
  const proxyAuthorization = `Basic ${Buffer.from(
    `${decodeURIComponent(user)}:${decodeURIComponent(pass)}`,
  ).toString("base64")}`;
  return { host, port, proxyAuthorization };
}

