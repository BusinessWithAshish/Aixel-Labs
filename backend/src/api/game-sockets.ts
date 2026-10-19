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

/** How often a draining games process checks whether its last running match has finished. */
const DRAIN_CHECK_MS = 5_000;

type GameGateway = {
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  drain(): number;
};

/**
 * Call once, after `app.listen`. Not available on Vercel (no long-lived server there).
 * Returns `drain`, for SIGTERM: a deploy has already sent new players to the next games
 * process, so new upgrades are refused, sockets without a running match are dropped (they
 * reconnect there), and the rest stay until their match ends. Rooms live only in memory, so
 * this is what keeps a match alive through a deploy. Once no running match has a player
 * here, the remaining sockets are closed and `onIdle` runs (`server.close()` waits for them).
 */
export function attachGameSockets(server: Server): (onIdle: () => void) => void {
  const gateways: Record<string, GameGateway> = {
    [BUSINESS_ROUTES.WS]: createBusinessGateway(),
    [BLUFF_ROUTES.WS]: createBluffGateway(),
  };
  const open = new Set<Duplex>();
  let draining = false;
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Node drops its own listener on upgrade: without one, a reset connection would crash the process.
    socket.on("error", () => {});
    const gateway = gateways[(req.url ?? "").split("?")[0]];
    if (!gateway || draining) return void socket.destroy();
    open.add(socket);
    socket.once("close", () => open.delete(socket));
    gateway.upgrade(req, socket, head);
  });
  return (onIdle) => {
    draining = true;
    let reported = -1;
    const check = () => {
      const live = Object.values(gateways).reduce((sum, gateway) => sum + gateway.drain(), 0);
      if (live > 0) {
        if (live !== reported) console.log(`[games] draining: ${live} match(es) still running here`);
        reported = live;
        return void setTimeout(check, DRAIN_CHECK_MS);
      }
      for (const socket of open) socket.destroy();
      onIdle();
    };
    check();
  };
}
