import { BLUFF_ROUTES } from '@aixellabs/backend/bluff/constants';
import type { BluffClientMessage, BluffServerMessage } from '@aixellabs/backend/bluff/types';

/** Where the game lives when opened without the tenant subdomain (local dev). */
const PRODUCT_PATH = '/products/bluff';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** '' on bluff.<root domain> (middleware rewrites it), '/products/bluff' on a plain host. */
export function gameBasePath(pathname: string): string {
    return pathname.startsWith(PRODUCT_PATH) ? PRODUCT_PATH : '';
}

/**
 * Server side: the backend WebSocket URL to hand to the browser. NEXT_PUBLIC_BLUFF_WS_URL wins
 * when set; otherwise it is derived from BE_API, which works locally and in production.
 */
export function serverBluffWsUrl(): string | null {
    const explicit = process.env.NEXT_PUBLIC_BLUFF_WS_URL?.trim();
    if (explicit) return explicit;
    const backend = process.env.BE_API?.trim();
    return backend ? backend.replace(/^http/, 'ws').replace(/\/$/, '') + BLUFF_ROUTES.WS : null;
}

/** Browser side: a backend on localhost is rewritten to the host the page was opened on, so a phone on the same Wi-Fi reaches it too. */
export function bluffWsUrl(serverUrl: string | null): string {
    if (!serverUrl) throw new Error('The game server address is not configured.');
    const url = new URL(serverUrl);
    if (LOCAL_HOSTS.includes(url.hostname) && !LOCAL_HOSTS.includes(window.location.hostname))
        url.hostname = window.location.hostname;
    return url.toString();
}

type SeatToken = { token: string; seat: number };

function read<T>(key: string): T | null {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function write(key: string, value: unknown) {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private mode: the seat simply cannot be reclaimed after a refresh */
    }
}

export const loadSeat = (code: string) => read<SeatToken>(`bl:seat:${code}`);
/** The room this browser last held a seat in, so the main screen can offer the way back. */
export const loadLastRoom = () => read<string>('bl:last-room');
export const forgetLastRoom = () => write('bl:last-room', null);
export const rememberRoom = (code: string) => write('bl:last-room', code);
export function saveSeat(code: string, seat: SeatToken | null) {
    write(`bl:seat:${code}`, seat);
    if (seat) rememberRoom(code);
    else if (loadLastRoom() === code) forgetLastRoom();
}

/** Opens a short-lived socket, sends one message, and resolves with the first answer of the kind asked for. */
function askServer<K extends BluffServerMessage['t']>(
    serverUrl: string | null,
    msg: BluffClientMessage,
    answer: K,
): Promise<Extract<BluffServerMessage, { t: K }>> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(bluffWsUrl(serverUrl));
        const done = (settle: () => void) => {
            window.clearTimeout(timer);
            ws.close();
            settle();
        };
        const timer = window.setTimeout(
            () => done(() => reject(new Error('The game server did not answer. Is the backend running?'))),
            8000,
        );
        ws.onopen = () => ws.send(JSON.stringify(msg));
        ws.onerror = () => done(() => reject(new Error('Could not reach the game server. Is the backend running?')));
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data as string) as BluffServerMessage;
            if (data.t === answer) done(() => resolve(data as Extract<BluffServerMessage, { t: K }>));
            else if (data.t === 'error') done(() => reject(new Error(data.message)));
        };
    });
}

/** Creates a room and hands back the seat token. */
export const createRoomRequest = (serverUrl: string | null, msg: Extract<BluffClientMessage, { t: 'create' }>) =>
    askServer(serverUrl, msg, 'joined');

/** Whether a room still exists, and who is hosting it. Rejects when it is gone. */
export const peekRoomRequest = (serverUrl: string | null, code: string) =>
    askServer(serverUrl, { t: 'peek', code }, 'peek').then((answer) => answer.room);
