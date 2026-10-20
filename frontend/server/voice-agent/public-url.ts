import 'server-only';

import { isIP } from 'node:net';

/**
 * Which URLs the server may call for a voice owner: their custom tools' webhooks and the recording
 * links providers hand over. In production only public https hosts, so a crafted URL cannot point
 * the server inward; outside it, this machine too, for local testing.
 */

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
        const [a, b] = address.split('.').map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }
    if (version === 6) {
        const lower = address.toLowerCase();
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return (
            lower === '::' ||
            lower === '::1' ||
            /^f[cd]/.test(lower) ||
            /^fe[89ab]/.test(lower) ||
            lower.startsWith('ff') ||
            lower.startsWith('64:ff9b:')
        );
    }
    return false;
}

/** "[::1]" -> "::1"; URL hostnames keep IPv6 brackets. */
export const bareHostname = (hostname: string) => hostname.replace(/^\[|\]$/g, '').toLowerCase();

function isLocalHostname(hostname: string): boolean {
    const host = bareHostname(hostname);
    return host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host);
}

/** A custom tool's URL: https only; plain http to this machine is fine outside production. */
export function parseWebhookUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('Enter a full URL, starting with https://');
    }
    if (url.username || url.password) throw new Error('Leave the login out of the URL. Use the secret to sign requests.');
    const host = bareHostname(url.hostname);
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (url.protocol === 'http:' && loopback && !isProduction()) return url;
    if (url.protocol !== 'https:') throw new Error('The URL has to start with https://');
    if (isProduction() && isLocalHostname(url.hostname)) {
        throw new Error('That URL points at a private network address. Use a public https URL.');
    }
    return url;
}

/** A provider's recording link: in production a public https host name (no IP literals). */
export function isFetchableLink(link: string): boolean {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return false;
    }
    if (!isProduction()) return url.protocol === 'https:' || url.protocol === 'http:';
    const host = bareHostname(url.hostname);
    return url.protocol === 'https:' && !isIP(host) && !isLocalHostname(host) && host.includes('.');
}
