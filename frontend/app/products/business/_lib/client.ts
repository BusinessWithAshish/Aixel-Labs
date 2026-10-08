import { BUSINESS_ROUTES } from '@aixellabs/backend/business/constants';
import type { BusinessClientMessage, BusinessServerMessage } from '@aixellabs/backend/business/types';

/** Where the game lives when opened without the tenant subdomain (local dev). */
const PRODUCT_PATH = '/products/business';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** '' on business.<root domain> (middleware rewrites it), '/products/business' on a plain host. */
export function gameBasePath(pathname: string): string {
    return pathname.startsWith(PRODUCT_PATH) ? PRODUCT_PATH : '';
}

/**
 * Server side: the backend WebSocket URL to hand to the browser. Set
 * NEXT_PUBLIC_BUSINESS_WS_URL in production (the public wss:// address);
 * otherwise it is derived from BE_API, which is what local dev uses.
 */
export function serverBusinessWsUrl(): string | null {
    const explicit = process.env.NEXT_PUBLIC_BUSINESS_WS_URL?.trim();
    if (explicit) return explicit;
    const backend = process.env.BE_API?.trim();
    return backend ? backend.replace(/^http/, 'ws').replace(/\/$/, '') + BUSINESS_ROUTES.WS : null;
}

/**
 * Browser side: a backend on localhost is rewritten to the host the page was
 * opened on, so a phone on the same Wi-Fi reaches the laptop's backend too.
 */
export function businessWsUrl(serverUrl: string | null): string {
    if (!serverUrl) throw new Error('The game server address is not configured.');
    const url = new URL(serverUrl);
    if (LOCAL_HOSTS.includes(url.hostname) && !LOCAL_HOSTS.includes(window.location.hostname)) url.hostname = window.location.hostname;
    return url.toString();
}

export const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

type SeatToken = { token: string; seat: number };
type Profile = { name: string };

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

export const loadSeat = (code: string) => read<SeatToken>(`bb:seat:${code}`);
/** The room this browser last held a seat in, so the main screen can offer the way back. */
export const loadLastRoom = () => read<string>('bb:last-room');
export const forgetLastRoom = () => write('bb:last-room', null);
/** Called whenever this browser takes its seat in a room again, so "last" means the last one played in. */
export const rememberRoom = (code: string) => write('bb:last-room', code);
export function saveSeat(code: string, seat: SeatToken | null) {
    write(`bb:seat:${code}`, seat);
    if (seat) rememberRoom(code);
    else if (loadLastRoom() === code) forgetLastRoom();
}
/** The newest "What's new" entry this browser has shown (see whats-new.ts); null on a first visit. */
export const loadSeenUpdate = () => read<number>('bb:seen-update');
export const saveSeenUpdate = (id: number) => write('bb:seen-update', id);
export const loadProfile = () => read<Profile>('bb:profile');
export const saveProfile = (profile: Profile) => write('bb:profile', profile);
export const loadMuted = () => read<boolean>('bb:mute') === true;
export const saveMuted = (muted: boolean) => write('bb:mute', muted);
/** Music is on until the player switches it off. */
export const loadMusicOn = () => read<boolean>('bb:music') !== false;
export const saveMusicOn = (on: boolean) => write('bb:music', on);

/** Opens a short-lived socket, sends one message, and resolves with the first answer of the kind asked for. */
function askServer<K extends BusinessServerMessage['t']>(
    serverUrl: string | null,
    msg: BusinessClientMessage,
    answer: K,
): Promise<Extract<BusinessServerMessage, { t: K }>> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(businessWsUrl(serverUrl));
        const done = (settle: () => void) => {
            window.clearTimeout(timer);
            ws.close();
            settle();
        };
        const timer = window.setTimeout(() => done(() => reject(new Error('The game server did not answer. Is the backend running?'))), 8000);
        ws.onopen = () => ws.send(JSON.stringify(msg));
        ws.onerror = () => done(() => reject(new Error('Could not reach the game server. Is the backend running?')));
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data as string) as BusinessServerMessage;
            if (data.t === answer) done(() => resolve(data as Extract<BusinessServerMessage, { t: K }>));
            else if (data.t === 'error') done(() => reject(new Error(data.message)));
        };
    });
}

/** Creates a room and hands back the seat token. */
export const createRoomRequest = (serverUrl: string | null, msg: Extract<BusinessClientMessage, { t: 'create' }>) => askServer(serverUrl, msg, 'joined');

/** Whether a room still exists, and who is hosting it. Rejects when it is gone. */
export const peekRoomRequest = (serverUrl: string | null, code: string) => askServer(serverUrl, { t: 'peek', code }, 'peek').then((answer) => answer.room);

/** Whether `gap` works in flex layouts. It cannot be asked of CSS (`@supports` says yes for grids), so it is measured once. */
export function supportsFlexGap(): boolean {
    const probe = document.createElement('div');
    probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    probe.append(document.createElement('div'), document.createElement('div'));
    document.body.appendChild(probe);
    const works = probe.scrollHeight === 1;
    probe.remove();
    return works;
}

/** Dark ink on a light player colour (white, yellow), white ink on the rest: a letter always shows on its own colour. */
export function inkOn(color: string): string {
    const n = parseInt(color.slice(1), 16);
    const light = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return light > 0.62 ? '#2a1b4d' : '#ffffff';
}

/** The first character of a name as a person sees it, so an emoji stays whole. */
export const initial = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();

/** Cuts a name to the longest allowed, counting an emoji as one character. */
export const clampName = (name: string, max: number) => Array.from(name).slice(0, max).join('');
