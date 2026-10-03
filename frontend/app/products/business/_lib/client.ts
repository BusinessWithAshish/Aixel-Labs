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
export const saveSeat = (code: string, seat: SeatToken | null) => write(`bb:seat:${code}`, seat);
export const loadProfile = () => read<Profile>('bb:profile');
export const saveProfile = (profile: Profile) => write('bb:profile', profile);
export const loadMuted = () => read<boolean>('bb:mute') === true;
export const saveMuted = (muted: boolean) => write('bb:mute', muted);
/** Music is on until the player switches it off. */
export const loadMusicOn = () => read<boolean>('bb:music') !== false;
export const saveMusicOn = (on: boolean) => write('bb:music', on);

/** Opens a short-lived socket to create a room, then hands back the seat token. */
export function createRoomRequest(
    serverUrl: string | null,
    msg: Extract<BusinessClientMessage, { t: 'create' }>,
): Promise<{ code: string; seat: number; token: string }> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(businessWsUrl(serverUrl));
        const timer = window.setTimeout(() => {
            ws.close();
            reject(new Error('The game server did not answer. Is the backend running?'));
        }, 8000);
        ws.onopen = () => ws.send(JSON.stringify(msg));
        ws.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('Could not reach the game server. Is the backend running?'));
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data as string) as BusinessServerMessage;
            if (data.t === 'joined') {
                window.clearTimeout(timer);
                ws.close();
                resolve({ code: data.code, seat: data.seat, token: data.token });
            } else if (data.t === 'error') {
                window.clearTimeout(timer);
                ws.close();
                reject(new Error(data.message));
            }
        };
    });
}
