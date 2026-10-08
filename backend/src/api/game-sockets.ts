/**
 * Routes WebSocket upgrades to the game that owns the path. Each game runs its own gateway and
 * room clock; anything else is closed here, since nothing else on this server upgrades.
 */
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { BLUFF_ROUTES } from "./bluff/constants";
import { createBluffGateway } from "./bluff/socket";
import { BUSINESS_ROUTES } from "./business/constants";
import { createBusinessGateway } from "./business/socket";

/** Call once, after `app.listen`. Not available on Vercel (no long-lived server there). */
export function attachGameSockets(server: Server) {
  const gateways: Record<string, { upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void }> = {
    [BUSINESS_ROUTES.WS]: createBusinessGateway(),
    [BLUFF_ROUTES.WS]: createBluffGateway(),
  };
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Node drops its own listener on upgrade: without one, a reset connection would crash the process.
    socket.on("error", () => {});
    const gateway = gateways[(req.url ?? "").split("?")[0]];
    if (!gateway) return void socket.destroy();
    gateway.upgrade(req, socket, head);
  });
}
