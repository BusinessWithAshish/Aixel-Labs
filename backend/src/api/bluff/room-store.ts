/**
 * Process-local rooms for Bluff, the same model as Big Business: no database, so a backend
 * restart ends every active match.
 */
import { createHash, randomBytes, randomInt } from "crypto";
import { BLUFF_ERRORS, BLUFF_LOBBY_COLOR, BLUFF_PLAYER_COLORS, BLUFF_RULES } from "./constants";
import { botCommand } from "./engine/bot";
import { applyCommand, BluffRuleError, createGame, endMatch, publicView, tick } from "./engine/rules";
import type { BluffCommand, BluffGameState, BluffRoomConfig, BluffRoomSummary, BluffRoomView } from "./types";

/** No I, O, 0 or 1: codes are read aloud and typed on phones. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const IDLE_TTL_MS = 30 * 60_000;
const MAX_ROOMS = 500;
/** A dropped connection gets this long to come back before the bot steps in. */
const BOT_GRACE_MS = 10_000;
/** A paused match restarts by itself once the host has been gone this long. */
const PAUSE_HOST_AWAY_MS = 60_000;
/** Gap between two bot moves, so its turns can be followed. */
const BOT_PACE_MS = 1600;

type Seat = {
  name: string;
  color: string;
  tokenHash: string;
  connections: number;
  /** Epoch ms since which nobody is connected to this seat, or null while someone is. */
  offlineAt: number | null;
};

export type BluffRoom = {
  code: string;
  hostSeat: number;
  config: BluffRoomConfig;
  seats: Seat[];
  state: BluffGameState | null;
  /** Epoch ms at which the host paused the match, or null while it runs. */
  pausedAt: number | null;
  /** Epoch ms before which the stand-in bot makes no further move. */
  botAt: number;
  /** Epoch ms of the last time anyone was connected or acted. */
  touchedAt: number;
};

export class BluffRoomError extends Error {}

const rooms = new Map<string, BluffRoom>();

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function addSeat(room: BluffRoom, name: string) {
  const token = randomBytes(24).toString("hex");
  room.seats.push({ name, color: BLUFF_LOBBY_COLOR, tokenHash: hashToken(token), connections: 0, offlineAt: null });
  return { seat: room.seats.length - 1, token };
}

const hostOnly = (room: BluffRoom, seat: number) => {
  if (seat !== room.hostSeat) throw new BluffRoomError(BLUFF_ERRORS.NOT_HOST);
};
const lobbyOnly = (room: BluffRoom) => {
  if (room.state) throw new BluffRoomError(BLUFF_ERRORS.ROOM_STARTED);
};

export function getRoom(code: string): BluffRoom {
  const room = rooms.get(code);
  if (!room) throw new BluffRoomError(BLUFF_ERRORS.ROOM_NOT_FOUND);
  return room;
}

export function createRoom(name: string, config: BluffRoomConfig, now: number) {
  if (rooms.size >= MAX_ROOMS) throw new BluffRoomError("The server is full. Try again in a few minutes.");
  const room: BluffRoom = { code: newCode(), hostSeat: 0, config, seats: [], state: null, pausedAt: null, botAt: 0, touchedAt: now };
  rooms.set(room.code, room);
  return { room, ...addSeat(room, name) };
}

export function joinRoom(code: string, name: string, now: number) {
  const room = getRoom(code);
  lobbyOnly(room);
  if (room.seats.length >= room.config.seats) throw new BluffRoomError(BLUFF_ERRORS.ROOM_FULL);
  room.touchedAt = now;
  return { room, ...addSeat(room, name) };
}

/** Maps a reconnect token to its seat. The client never names its own seat. */
export function resumeSeat(code: string, token: string): { room: BluffRoom; seat: number } {
  const room = getRoom(code);
  const seat = room.seats.findIndex((s) => s.tokenHash === hashToken(token));
  if (seat < 0) throw new BluffRoomError(BLUFF_ERRORS.BAD_TOKEN);
  return { room, seat };
}

export function configureRoom(room: BluffRoom, seat: number, patch: Partial<BluffRoomConfig>) {
  hostOnly(room, seat);
  lobbyOnly(room);
  if (patch.seats !== undefined) room.config.seats = Math.max(patch.seats, room.seats.length);
  if (patch.turnSeconds !== undefined) room.config.turnSeconds = patch.turnSeconds;
  if (patch.missLimit !== undefined) room.config.missLimit = patch.missLimit;
  if (patch.endMode !== undefined) room.config.endMode = patch.endMode;
}

/** Host only, lobby only: frees a seat. Later seats move up one. */
export function kickSeat(room: BluffRoom, seat: number, target: number) {
  hostOnly(room, seat);
  lobbyOnly(room);
  if (target === room.hostSeat || !room.seats[target]) throw new BluffRoomError("That seat cannot be removed.");
  room.seats.splice(target, 1);
}

/** Host, lobby: moves a seat in the turn order. Returns where every seat went (old index → new index). */
export function moveSeat(room: BluffRoom, seat: number, from: number, to: number): number[] {
  hostOnly(room, seat);
  lobbyOnly(room);
  if (!room.seats[from] || !room.seats[to]) throw new BluffRoomError("That seat cannot be moved.");
  const order = room.seats.map((_, i) => i);
  order.splice(to, 0, ...order.splice(from, 1));
  room.seats = order.map((i) => room.seats[i]);
  const moved = room.seats.map((_, i) => order.indexOf(i));
  room.hostSeat = moved[room.hostSeat];
  return moved;
}

/** Host, during the match: freeze or restart every clock. Time spent paused is given back to all of them. */
export function setPaused(room: BluffRoom, seat: number, on: boolean, now: number) {
  hostOnly(room, seat);
  if (!room.state || room.state.phase === "over") throw new BluffRoomError("There is no match to pause.");
  if (on) {
    room.pausedAt = room.pausedAt ?? now;
    return;
  }
  if (room.pausedAt === null) return;
  const lost = now - room.pausedAt;
  const s = structuredClone(room.state);
  if (s.deadline !== null) s.deadline += lost;
  if (s.round.holdUntil) s.round.holdUntil += lost;
  if (s.round.closingAt !== null) s.round.closingAt += lost;
  if (s.reveal) s.reveal.until += lost;
  s.rev++;
  room.state = s;
  room.pausedAt = null;
  room.botAt = now + BOT_PACE_MS;
}

/** Host, during the match: it ends now and everyone sees the result. Returns false when no match is running. */
export function endRoomMatch(room: BluffRoom, seat: number): boolean {
  hostOnly(room, seat);
  if (!room.state || room.state.phase === "over") return false;
  room.state = endMatch(room.state);
  room.pausedAt = null;
  return true;
}

/** Host only: the room ends for everyone. */
export function closeRoom(room: BluffRoom, seat: number) {
  hostOnly(room, seat);
  rooms.delete(room.code);
}

/** Called by the socket layer as people come and go, so the stand-in bot knows who is away. */
export function seatPresence(room: BluffRoom, seat: number, now: number) {
  const s = room.seats[seat];
  if (s) s.offlineAt = s.connections > 0 ? null : (s.offlineAt ?? now);
}

export function startRoom(room: BluffRoom, seat: number, now: number) {
  hostOnly(room, seat);
  lobbyOnly(room);
  if (room.seats.length < BLUFF_RULES.MIN_SEATS) throw new BluffRoomError(BLUFF_ERRORS.NEED_PLAYERS);
  // Colours are dealt at random at the start, so nobody picks one in the lobby.
  const colors = [...BLUFF_PLAYER_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  room.seats.forEach((s, i) => (s.color = colors[i]));
  room.state = createGame(room.seats, room.config, randomInt(2 ** 31 - 1), now);
  room.touchedAt = now;
}

export function commandRoom(room: BluffRoom, seat: number, cmd: BluffCommand, now: number) {
  if (!room.state) throw new BluffRoomError("The match has not started yet.");
  if (room.pausedAt !== null && cmd.type !== "leave") throw new BluffRoomError("The host has paused the game.");
  room.state = applyCommand(room.state, seat, cmd, now);
  room.touchedAt = now;
}

/** Advances every room's clock. Returns the rooms whose state changed. */
export function tickRooms(now: number): BluffRoom[] {
  const changed: BluffRoom[] = [];
  for (const room of rooms.values()) {
    if (room.seats.some((s) => s.connections > 0)) room.touchedAt = now;
    if (now - room.touchedAt > IDLE_TTL_MS) {
      rooms.delete(room.code);
      continue;
    }
    // A pause ends by itself: after its time limit, or sooner if the host who called it has dropped off.
    const host = room.seats[room.hostSeat];
    const hostGone = host.offlineAt !== null && now - host.offlineAt > PAUSE_HOST_AWAY_MS;
    if (room.state && room.pausedAt !== null && (hostGone || now - room.pausedAt > BLUFF_RULES.PAUSE_MAX_SECONDS * 1000)) {
      setPaused(room, room.hostSeat, false, now);
      changed.push(room);
    }
    if (!room.state || room.pausedAt !== null) continue;
    if (playForAbsent(room, now)) changed.push(room);
    const next = tick(room.state, now);
    if (next !== room.state) {
      room.state = next;
      if (!changed.includes(room)) changed.push(room);
    }
  }
  return changed;
}

/** A player who has dropped off keeps their seat: the bot plays their turn until they are back. Returns true when it moved. */
function playForAbsent(room: BluffRoom, now: number): boolean {
  const state = room.state;
  if (!state || state.phase !== "play" || now < room.botAt) return false;
  const seat = room.seats[state.turn];
  if (!seat || seat.offlineAt === null || now - seat.offlineAt < BOT_GRACE_MS) return false;
  const cmd = botCommand(state, state.turn, now);
  if (!cmd) return false;
  room.botAt = now + BOT_PACE_MS;
  try {
    room.state = applyCommand(state, state.turn, cmd, now);
    return true;
  } catch (err) {
    // A move the rules refuse is skipped; the turn timer still moves the game on.
    if (!(err instanceof BluffRuleError)) throw err;
    return false;
  }
}

export function viewRoom(room: BluffRoom, you: number, now: number): BluffRoomView {
  return {
    code: room.code,
    hostSeat: room.hostSeat,
    config: room.config,
    seats: room.seats.map((s, seat) => ({ seat, name: s.name, color: s.color, connected: s.connections > 0 })),
    started: !!room.state,
    pausedAt: room.pausedAt,
    state: room.state ? publicView(room.state, you) : null,
    you,
    now,
  };
}

export function summarizeRoom(code: string): BluffRoomSummary {
  const room = getRoom(code);
  return { code: room.code, started: !!room.state, seatsTaken: room.seats.length, seats: room.config.seats, host: room.seats[room.hostSeat]?.name ?? "" };
}
