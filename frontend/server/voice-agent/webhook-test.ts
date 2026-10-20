import 'server-only';

import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { type IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { VOICE_WEBHOOK_LIMITS, type VoiceWebhookParam } from '@aixellabs/backend/db/types';
import { bareHostname, isPrivateAddress, isProduction } from '@/server/voice-agent/public-url';

/** A test request as the engine would send it, and what came back. */
export type VoiceWebhookTestResult = {
    /** A 2xx answer: the agent would read `body`. */
    ok: boolean;
    /** HTTP status, or null when no answer came (see `error`). */
    status: number | null;
    /** First 1000 characters of the answer. */
    body: string;
    contentType: string | null;
    durationMs: number;
    /** Why there was no answer, in plain words. */
    error: string | null;
    /** The JSON body that was posted, pretty-printed. */
    sent: string;
    signed: boolean;
};

type RawAnswer = { status: number; contentType: string | null; body: string };

const TEST_BODY_READ_LIMIT = 64 * 1024;

/** Example arguments for a test: one per parameter, by type. */
export function sampleArguments(parameters: VoiceWebhookParam[]): Record<string, string | number | boolean> {
    return Object.fromEntries(
        parameters.map((p) => [p.name, p.type === 'number' ? 1 : p.type === 'boolean' ? true : 'example']),
    );
}

/**
 * POSTs `body` to `url` without following redirects. The host is resolved once, checked (in production:
 * no private or metadata addresses) and the connection is pinned to that address.
 */
async function postOnce(url: URL, body: string, headers: Record<string, string>): Promise<RawAnswer> {
    const hostname = bareHostname(url.hostname);
    const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await dnsLookup(hostname, { all: true });
    if (addresses.length === 0) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    if (isProduction() && addresses.some((a) => isPrivateAddress(a.address))) {
        throw Object.assign(new Error('private address'), { code: 'AIXEL_PRIVATE' });
    }
    const [{ address, family }] = addresses;
    const pinned: LookupFunction = (_host, options, callback) => {
        if (options.all)
            (callback as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
        else callback(null, address, family);
    };

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<RawAnswer>((resolve, reject) => {
        const req = send(
            url,
            {
                method: 'POST',
                headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
                lookup: pinned,
                timeout: VOICE_WEBHOOK_LIMITS.timeoutMs,
            },
            (res: IncomingMessage) => {
                const chunks: Buffer[] = [];
                let size = 0;
                res.on('data', (chunk: Buffer) => {
                    if (size < TEST_BODY_READ_LIMIT) chunks.push(chunk);
                    size += chunk.length;
                    if (size >= TEST_BODY_READ_LIMIT) res.destroy();
                });
                const finish = () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        contentType: res.headers['content-type'] ?? null,
                        body: Buffer.concat(chunks).toString('utf8'),
                    });
                res.on('end', finish);
                res.on('close', finish);
                res.on('error', finish);
            },
        );
        const timer = setTimeout(
            () => req.destroy(Object.assign(new Error('timeout'), { code: 'AIXEL_TIMEOUT' })),
            VOICE_WEBHOOK_LIMITS.timeoutMs,
        );
        req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'AIXEL_TIMEOUT' })));
        req.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        req.on('close', () => clearTimeout(timer));
        req.end(body);
    });
}

function testFailureMessage(error: unknown, host: string): string {
    const code = (error as { code?: string } | null)?.code ?? '';
    if (code === 'AIXEL_TIMEOUT') return `No answer from ${host} within ${VOICE_WEBHOOK_LIMITS.timeoutMs / 1000} seconds.`;
    if (code === 'AIXEL_PRIVATE') return 'That URL points at a private network address, which tools cannot call.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Could not find ${host}. Check the URL.`;
    if (code === 'ECONNREFUSED') return `${host} refused the connection. Is the server running?`;
    if (code === 'ECONNRESET' || code === 'EPIPE') return `${host} closed the connection before answering.`;
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return `${host} cannot be reached from here.`;
    if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) return `${host}'s security certificate is not valid.`;
    return `Could not reach ${host}.`;
}

/**
 * Sends one request the way the engine calls a tool mid-call: the same JSON body, headers, signature
 * (when there is a secret) and 8 s limit. Never throws: a failure is in the result's `error`.
 */
export async function sendWebhookTest(url: URL, payload: object, secret: string | null): Promise<VoiceWebhookTestResult> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AixelLabs-VoiceAgent/1',
    };
    if (secret) headers['X-Aixel-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    const started = Date.now();
    const base = { sent: JSON.stringify(payload, null, 2), signed: !!secret };
    try {
        const answer = await postOnce(url, body, headers);
        return {
            ...base,
            ok: answer.status >= 200 && answer.status < 300,
            status: answer.status,
            body: answer.body.slice(0, 1000),
            contentType: answer.contentType,
            durationMs: Date.now() - started,
            error: null,
        };
    } catch (error) {
        return {
            ...base,
            ok: false,
            status: null,
            body: '',
            contentType: null,
            durationMs: Date.now() - started,
            error: testFailureMessage(error, url.host),
        };
    }
}
