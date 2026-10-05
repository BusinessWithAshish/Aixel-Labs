/**
 * Process-local rooms. v1 deliberately has no database: a backend restart ends
 * every active match, and the lobby says so.
 */
import { createHash, randomBytes, randomInt } from "crypto";
import { BUSINESS_ERRORS, BUSINESS_LOBBY_COLOR, BUSINESS_PLAYER_COLORS, BUSINESS_RULES } from "./constants";
import { botCommand } from "./engine/bot";
import { applyCommand, BusinessRuleError, createGame, publicView, tick } from "./engine/rules";
import type {
  BusinessCommand,
  BusinessGameState,
  BusinessRoomConfig,
  BusinessRoomSummary,
  BusinessRoomView,
} from "./types";

/** No I, O, 0 or 1: codes are read aloud and typed on phones. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const IDLE_TTL_MS = 30 * 60_000;
const MAX_ROOMS = 500;
/**
 * A dropped connection gets this long to come back before the bot steps in. If
 * the turn timer runs out first, that turn is simply missed, like any other.
 */
const BOT_GRACE_MS = 10_000;
/** A paused match restarts by itself once the host has been gone this long. */
const PAUSE_HOST_AWAY_MS = 60_000;
/** Gap between two bot moves; longer after a roll, while everyone watches the pawn walk. */
const BOT_PACE_MS = 1600;
const BOT_AFTER_ROLL_MS = 4200;

type Seat = {
  name: string;
  color: string;
  tokenHash: string;
  connections: number;
  /** Team play: 0 = Alpha, 1 = Beta, -1 = not placed yet. Ignored in a solo room. */
  team: number;
  /** Epoch ms since which nobody is connected to this seat, or null while someone is. */
  offlineAt: number | null;
};

export type BusinessRoom = {
  code: string;
  hostSeat: number;
  config: BusinessRoomConfig;
  seats: Seat[];
  state: BusinessGameState | null;
  /** Epoch ms at which the host paused the match, or null while it runs. */
  pausedAt: number | null;
  /** Epoch ms before which the stand-in bot makes no further move, so its turns can be followed. */
  botAt: number;
  /** Epoch ms of the last time anyone was connected or acted. */
  touchedAt: number;
};

export class BusinessRoomError extends Error {}

const rooms = new Map<string, BusinessRoom>();

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function addSeat(room: BusinessRoom, name: string) {
  const token = randomBytes(24).toString("hex");
  // A new player is not in a team until the host places them.
  room.seats.push({ name, color: BUSINESS_LOBBY_COLOR, tokenHash: hashToken(token), connections: 0, team: -1, offlineAt: null });
  return { seat: room.seats.length - 1, token };
}

export function getRoom(code: string): BusinessRoom {
  const room = rooms.get(code);
  if (!room) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_NOT_FOUND);
  return room;
}

export function createRoom(name: string, config: BusinessRoomConfig, now: number) {
  if (rooms.size >= MAX_ROOMS) throw new BusinessRoomError("The server is full. Try again in a few minutes.");
  const room: BusinessRoom = { code: newCode(), hostSeat: 0, config, seats: [], state: null, pausedAt: null, botAt: 0, touchedAt: now };
  rooms.set(room.code, room);
  return { room, ...addSeat(room, name) };
}

export function joinRoom(code: string, name: string, now: number) {
  const room = getRoom(code);
  if (room.state) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_STARTED);
  if (room.seats.length >= room.config.seats) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_FULL);
  room.touchedAt = now;
  return { room, ...addSeat(room, name) };
}

/** Maps a reconnect token to its seat. The client never names its own seat. */
export function resumeSeat(code: string, token: string): { room: BusinessRoom; seat: number } {
  const room = getRoom(code);
  const seat = room.seats.findIndex((s) => s.tokenHash === hashToken(token));
  if (seat < 0) throw new BusinessRoomError(BUSINESS_ERRORS.BAD_TOKEN);
  return { room, seat };
}

export function configureRoom(room: BusinessRoom, seat: number, patch: Partial<BusinessRoomConfig>) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  if (room.state) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_STARTED);
  if (patch.seats !== undefined) room.config.seats = Math.max(patch.seats, room.seats.length);
  if (patch.minutes !== undefined) room.config.minutes = patch.minutes;
  if (patch.missLimit !== undefined) room.config.missLimit = patch.missLimit;
  if (patch.teams !== undefined) room.config.teams = patch.teams;
  if (patch.salaryCap !== undefined) room.config.salaryCap = patch.salaryCap;
}

/** Host only, lobby only: frees a seat. Later seats move up one. */
export function kickSeat(room: BusinessRoom, seat: number, target: number) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  if (room.state) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_STARTED);
  if (target === room.hostSeat || !room.seats[target]) throw new BusinessRoomError("That seat cannot be removed.");
  room.seats.splice(target, 1);
}

/** Host, lobby: place a seat in Alpha (0) or Beta (1), or take it out again (-1). Any split works, 1 v 4 included. */
export function setTeam(room: BusinessRoom, seat: number, target: number, team: number) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  if (room.state) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_STARTED);
  if (!room.seats[target]) throw new BusinessRoomError("That seat is empty.");
  room.seats[target].team = team;
}

/** Host, during the match: freeze or restart every clock. Time spent paused is given back to all of them. */
export function setPaused(room: BusinessRoom, seat: number, on: boolean, now: number) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  if (!room.state || room.state.phase === "over") throw new BusinessRoomError("There is no match to pause.");
  if (on) {
    room.pausedAt = room.pausedAt ?? now;
    return;
  }
  if (room.pausedAt === null) return;
  const lost = now - room.pausedAt;
  const s = structuredClone(room.state);
  if (s.deadline !== null) s.deadline += lost;
  if (s.endsAt !== null) s.endsAt += lost;
  if (s.pending?.type === "auction") s.pending.endsAt += lost;
  for (const offer of s.offers) offer.expiresAt += lost;
  if (s.hold) {
    s.hold.at += lost;
    s.hold.until += lost;
  }
  s.rev++;
  room.state = s;
  room.pausedAt = null;
  room.botAt = now + BOT_PACE_MS;
}

/** Host only: the room ends for everyone. */
export function closeRoom(room: BusinessRoom, seat: number) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  rooms.delete(room.code);
}

/** Called by the socket layer as people come and go, so the stand-in bot knows who is away. */
export function seatPresence(room: BusinessRoom, seat: number, now: number) {
  const s = room.seats[seat];
  if (s) s.offlineAt = s.connections > 0 ? null : (s.offlineAt ?? now);
}

export function startRoom(room: BusinessRoom, seat: number, now: number) {
  if (seat !== room.hostSeat) throw new BusinessRoomError(BUSINESS_ERRORS.NOT_HOST);
  if (room.state) throw new BusinessRoomError(BUSINESS_ERRORS.ROOM_STARTED);
  if (room.seats.length < BUSINESS_RULES.MIN_SEATS) throw new BusinessRoomError(BUSINESS_ERRORS.NEED_PLAYERS);
  if (room.config.teams) {
    if (room.seats.some((s) => s.team < 0)) throw new BusinessRoomError("Put every player in a team first.");
    if (new Set(room.seats.map((s) => s.team)).size < 2) throw new BusinessRoomError("Both teams need at least one player.");
  } else {
    // Solo: every player is a team of one.
    room.seats.forEach((s, i) => (s.team = i));
  }
  const teams = [...new Set(room.seats.map((s) => s.team))];
  // Colours are dealt at random at the start, one per team, so nobody picks one in the lobby.
  const colors = [...BUSINESS_PLAYER_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  room.seats.forEach((seat) => (seat.color = colors[teams.indexOf(seat.team)]));
  room.state = createGame(room.seats, room.config, randomInt(2 ** 31 - 1), now);
  room.touchedAt = now;
}

export function commandRoom(room: BusinessRoom, seat: number, cmd: BusinessCommand, now: number) {
  if (!room.state) throw new BusinessRoomError("The match has not started yet.");
  if (room.pausedAt !== null && cmd.type !== "leave") throw new BusinessRoomError("The host has paused the game.");
  room.state = applyCommand(room.state, seat, cmd, now);
  room.touchedAt = now;
}

/** Advances every room's clock. Returns the rooms whose state changed. */
export function tickRooms(now: number): BusinessRoom[] {
  const changed: BusinessRoom[] = [];
  for (const room of rooms.values()) {
    if (room.seats.some((s) => s.connections > 0)) room.touchedAt = now;
    if (now - room.touchedAt > IDLE_TTL_MS) {
      rooms.delete(room.code);
      continue;
    }
    // A host who paused and then dropped off would freeze the match for good: it restarts without them.
    const host = room.seats[room.hostSeat];
    if (room.state && room.pausedAt !== null && host.offlineAt !== null && now - host.offlineAt > PAUSE_HOST_AWAY_MS) {
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

/**
 * A player who has dropped off keeps their seat: a simple bot plays for them
 * until they are back. It makes one move at a time, with a pause between moves
 * so the others can follow. Returns true when it moved.
 */
function playForAbsent(room: BusinessRoom, now: number): boolean {
  const state = room.state;
  if (!state || state.phase === "over" || now < room.botAt) return false;
  for (const p of state.players) {
    const seat = room.seats[p.seat];
    if (p.bankrupt || seat.offlineAt === null || now - seat.offlineAt < BOT_GRACE_MS) continue;
    const cmd = botCommand(state, p.seat);
    if (!cmd) continue;
    try {
      room.state = applyCommand(state, p.seat, cmd, now);
      room.botAt = now + (cmd.type === "roll" ? BOT_AFTER_ROLL_MS : BOT_PACE_MS);
      return true;
    } catch (err) {
      // A move the rules refuse is skipped; the turn timer still moves the game on.
      if (!(err instanceof BusinessRuleError)) throw err;
      room.botAt = now + BOT_PACE_MS;
    }
  }
  return false;
}

export function viewRoom(room: BusinessRoom, you: number, now: number): BusinessRoomView {
  return {
    code: room.code,
    hostSeat: room.hostSeat,
    config: room.config,
    seats: room.seats.map((s, seat) => ({ seat, name: s.name, color: s.color, connected: s.connections > 0, team: s.team })),
    started: !!room.state,
    pausedAt: room.pausedAt,
    state: room.state ? publicView(room.state, you) : null,
    you,
    now,
  };
}

export function summarizeRoom(code: string): BusinessRoomSummary {
  const room = getRoom(code);
  return {
    code: room.code,
    started: !!room.state,
    seatsTaken: room.seats.length,
    seats: room.config.seats,
    host: room.seats[room.hostSeat]?.name ?? "",
  };
}
