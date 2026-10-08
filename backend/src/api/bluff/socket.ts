/**
 * WebSocket gateway for Bluff on `BLUFF_ROUTES.WS`; all play runs over this one socket.
 * Clients send intents, never state: the seat comes from the reconnect token, not the message.
 * Messages for a room are applied one at a time in arrival order, which is what decides a race
 * between two Bluff calls.
 */
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { ALLOWED_ORIGINS_DEV_REGEX, ALLOWED_ORIGINS_PROD_REGEX } from "../../config";
import { BLUFF_DEFAULT_MISS_LIMIT, BLUFF_ERRORS, BLUFF_ROUTES } from "./constants";
import { BluffLateError, BluffRuleError } from "./engine/rules";
import {
  BluffRoomError,
  closeRoom,
  commandRoom,
  configureRoom,
  createRoom,
  endRoomMatch,
  joinRoom,
  kickSeat,
  moveSeat,
  resumeSeat,
  seatPresence,
  setPaused,
  startRoom,
  summarizeRoom,
  tickRooms,
  viewRoom,
  type BluffRoom,
} from "./room-store";
import { BLUFF_CLIENT_MESSAGE_SCHEMA } from "./schemas";
import type { BluffClientMessage, BluffServerMessage } from "./types";

const TICK_MS = 250;
const MAX_MESSAGE_BYTES = 8 * 1024;
/** Messages allowed per socket per window before it is closed. */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 120;

type Session = { room: BluffRoom; seat: number };

const sessions = new Map<WebSocket, Session>();

function send(ws: WebSocket, message: BluffServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

/** Each socket gets its own view: only its own hand is in it. */
function broadcast(room: BluffRoom) {
  const now = Date.now();
  for (const [ws, session] of sessions) {
    if (session.room === room) send(ws, { t: "room", room: viewRoom(room, session.seat, now) });
  }
}

function attach(ws: WebSocket, room: BluffRoom, seat: number) {
  detach(ws);
  sessions.set(ws, { room, seat });
  room.seats[seat].connections++;
  seatPresence(room, seat, Date.now());
}

function detach(ws: WebSocket) {
  const session = sessions.get(ws);
  if (!session) return;
  sessions.delete(ws);
  const seat = session.room.seats[session.seat];
  if (seat) {
    seat.connections = Math.max(0, seat.connections - 1);
    seatPresence(session.room, session.seat, Date.now());
  }
  broadcast(session.room);
}

function handle(ws: WebSocket, msg: BluffClientMessage) {
  const now = Date.now();
  if (msg.t === "ping") return send(ws, { t: "pong" });

  if (msg.t === "create") {
    const { room, seat, token } = createRoom(msg.name, { seats: msg.seats, turnSeconds: msg.turnSeconds, missLimit: msg.missLimit ?? BLUFF_DEFAULT_MISS_LIMIT, endMode: "last" }, now);
    attach(ws, room, seat);
    send(ws, { t: "joined", code: room.code, seat, token });
    return broadcast(room);
  }
  if (msg.t === "join") {
    // A second tap on Join must not seat the same player twice.
    const already = sessions.get(ws);
    if (already && already.room.code === msg.code) return broadcast(already.room);
    const { room, seat, token } = joinRoom(msg.code, msg.name, now);
    attach(ws, room, seat);
    send(ws, { t: "joined", code: room.code, seat, token });
    return broadcast(room);
  }
  if (msg.t === "peek") return send(ws, { t: "peek", room: summarizeRoom(msg.code) });
  if (msg.t === "resume") {
    const { room, seat } = resumeSeat(msg.code, msg.token);
    attach(ws, room, seat);
    return broadcast(room);
  }

  const session = sessions.get(ws);
  if (!session) throw new BluffRoomError(BLUFF_ERRORS.BAD_TOKEN);
  const hostLeaving = msg.t === "close" || (msg.t === "cmd" && msg.cmd.type === "leave" && session.seat === session.room.hostSeat);
  if (msg.t === "config") configureRoom(session.room, session.seat, { seats: msg.seats, turnSeconds: msg.turnSeconds, missLimit: msg.missLimit, endMode: msg.endMode });
  else if (msg.t === "start") startRoom(session.room, session.seat, now);
  else if (msg.t === "kick") {
    kickSeat(session.room, session.seat, msg.seat);
    // Seats after the removed one move up, so every socket's seat index follows.
    for (const [other, s] of sessions) {
      if (s.room !== session.room) continue;
      if (s.seat === msg.seat) {
        sessions.delete(other);
        send(other, { t: "kicked" });
      } else if (s.seat > msg.seat) s.seat--;
    }
  } else if (msg.t === "move") {
    const moved = moveSeat(session.room, session.seat, msg.seat, msg.to);
    for (const s of sessions.values()) if (s.room === session.room) s.seat = moved[s.seat];
  } else if (msg.t === "pause") setPaused(session.room, session.seat, msg.on, now);
  else if (msg.t === "end") endRoomMatch(session.room, session.seat);
  else if (hostLeaving && endRoomMatch(session.room, session.seat)) {
    // The host leaving a running match ends it properly: everyone gets the result, not a closed door.
  } else if (hostLeaving) {
    // With no match running, the host leaving closes the room for everyone.
    closeRoom(session.room, session.seat);
    for (const [other, s] of sessions) {
      if (s.room !== session.room) continue;
      sessions.delete(other);
      send(other, { t: "closed" });
    }
    return;
  } else if (msg.t === "cmd") {
    commandRoom(session.room, session.seat, msg.cmd, now);
    send(ws, { t: "ack", id: msg.id });
  }
  broadcast(session.room);
}

function originAllowed(origin: string | undefined): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (!origin) return false;
  return [...ALLOWED_ORIGINS_PROD_REGEX, ...ALLOWED_ORIGINS_DEV_REGEX].some((re) => re.test(origin));
}

/**
 * The gateway without a server: `upgrade` takes a WebSocket upgrade already known to be for
 * `BLUFF_ROUTES.WS`. Starts the room clock. Call once per process.
 */
export function createBluffGateway() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  wss.on("connection", (ws: WebSocket) => {
    let windowStart = Date.now();
    let count = 0;

    ws.on("message", (raw) => {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now;
        count = 0;
      }
      if (++count > RATE_MAX) return ws.close(1008, "Too many messages");

      let id: number | undefined;
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        return send(ws, { t: "error", message: BLUFF_ERRORS.INVALID_PARAMS });
      }
      try {
        const maybeId = (json as { id?: unknown } | null)?.id;
        if (typeof maybeId === "number") id = maybeId;
        const parsed = BLUFF_CLIENT_MESSAGE_SCHEMA.safeParse(json);
        if (!parsed.success) return send(ws, { t: "error", message: BLUFF_ERRORS.INVALID_PARAMS, id });
        handle(ws, parsed.data);
      } catch (err) {
        if (err instanceof BluffLateError) return send(ws, { t: "late", message: err.message, id });
        const known = err instanceof BluffRuleError || err instanceof BluffRoomError;
        if (!known) console.error("[bluff] socket error:", err);
        send(ws, { t: "error", message: known ? (err as Error).message : "Something went wrong.", id });
      }
    });

    ws.on("close", () => detach(ws));
    ws.on("error", () => detach(ws));
  });

  const timer = setInterval(() => {
    // Runs for every room for as long as the server is up: one bad room must not take the process down.
    try {
      for (const room of tickRooms(Date.now())) broadcast(room);
    } catch (err) {
      console.error("[bluff] tick error:", err);
    }
  }, TICK_MS);
  timer.unref();

  return {
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      if (!originAllowed(req.headers.origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
    },
  };
}

/** Bluff alone on a server (tests). The backend itself attaches every game through `attachGameSockets`. */
export function attachBluffSocket(server: Server) {
  const gateway = createBluffGateway();
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => {});
    if ((req.url ?? "").split("?")[0] !== BLUFF_ROUTES.WS) return void socket.destroy();
    gateway.upgrade(req, socket, head);
  });
}
