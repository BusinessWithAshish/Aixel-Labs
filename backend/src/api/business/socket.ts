/**
 * WebSocket gateway for Big Business. Attached to the backend's HTTP server on
 * `BUSINESS_ROUTES.WS`; all play runs over this one socket. Clients send
 * intents, never state: the seat comes from the reconnect token, not the message.
 */
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { ALLOWED_ORIGINS_DEV_REGEX, ALLOWED_ORIGINS_PROD_REGEX } from "../../config";
import { BUSINESS_ERRORS, BUSINESS_ROUTES } from "./constants";
import { BusinessRuleError } from "./engine/rules";
import {
  BusinessRoomError,
  closeRoom,
  commandRoom,
  configureRoom,
  createRoom,
  joinRoom,
  kickSeat,
  resumeSeat,
  seatPresence,
  setPaused,
  setTeam,
  startRoom,
  summarizeRoom,
  tickRooms,
  viewRoom,
  type BusinessRoom,
} from "./room-store";
import { BUSINESS_CLIENT_MESSAGE_SCHEMA } from "./schemas";
import type { BusinessClientMessage, BusinessServerMessage } from "./types";

const TICK_MS = 250;
const MAX_MESSAGE_BYTES = 8 * 1024;
/** Messages allowed per socket per window before it is closed. */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 120;

type Session = { room: BusinessRoom; seat: number };

const sessions = new Map<WebSocket, Session>();

function send(ws: WebSocket, message: BusinessServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room: BusinessRoom) {
  const now = Date.now();
  for (const [ws, session] of sessions) {
    if (session.room === room) send(ws, { t: "room", room: viewRoom(room, session.seat, now) });
  }
}

function attach(ws: WebSocket, room: BusinessRoom, seat: number) {
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

function handle(ws: WebSocket, msg: BusinessClientMessage) {
  const now = Date.now();
  if (msg.t === "ping") return send(ws, { t: "pong" });

  if (msg.t === "create") {
    const { room, seat, token } = createRoom(msg.name, { seats: msg.seats, minutes: msg.minutes, missLimit: msg.missLimit }, now);
    attach(ws, room, seat);
    send(ws, { t: "joined", code: room.code, seat, token });
    return broadcast(room);
  }
  if (msg.t === "join") {
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
  if (!session) throw new BusinessRoomError(BUSINESS_ERRORS.BAD_TOKEN);
  if (msg.t === "config") configureRoom(session.room, session.seat, { seats: msg.seats, minutes: msg.minutes, missLimit: msg.missLimit });
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
  }
  else if (msg.t === "team") setTeam(session.room, session.seat, msg.seat, msg.team);
  else if (msg.t === "pause") setPaused(session.room, session.seat, msg.on, now);
  else if (msg.t === "close" || (msg.t === "cmd" && msg.cmd.type === "leave" && session.seat === session.room.hostSeat)) {
    // The host leaving ends the room for everyone.
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

/** Call once, after `app.listen`. Not available on Vercel (no long-lived server there). */
export function attachBusinessSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== BUSINESS_ROUTES.WS) return;
    if (!originAllowed(req.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

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
        return send(ws, { t: "error", message: BUSINESS_ERRORS.INVALID_PARAMS });
      }
      try {
        const maybeId = (json as { id?: unknown } | null)?.id;
        if (typeof maybeId === "number") id = maybeId;
        const parsed = BUSINESS_CLIENT_MESSAGE_SCHEMA.safeParse(json);
        if (!parsed.success) return send(ws, { t: "error", message: BUSINESS_ERRORS.INVALID_PARAMS, id });
        handle(ws, parsed.data);
      } catch (err) {
        const known = err instanceof BusinessRuleError || err instanceof BusinessRoomError;
        if (!known) console.error("[business] socket error:", err);
        send(ws, { t: "error", message: known ? (err as Error).message : "Something went wrong.", id });
      }
    });

    ws.on("close", () => detach(ws));
    ws.on("error", () => detach(ws));
  });

  const timer = setInterval(() => {
    for (const room of tickRooms(Date.now())) broadcast(room);
  }, TICK_MS);
  timer.unref();
}
