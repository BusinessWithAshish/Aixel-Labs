import { NextResponse, type NextRequest } from 'next/server';
import { getCall } from '@/app/actions/voice-call-actions';
import { getActionErrorMessage } from '@/helpers/server-action-helpers';
import { isValidObjectId } from '@/helpers/object-id';
import { getAppSession } from '@/server/auth';
import { findOwnedCallRecording, type CallRecordingSource } from '@/server/voice-agent/recordings';

/**
 * The call's recording, streamed from the customer's provider account through the app.
 *
 * Telnyx hands out pre-signed links that expire after a few minutes, so the page never holds one:
 * every request here asks for a fresh link (cached briefly per user + call, because an <audio>
 * element sends a Range request per seek). Twilio's media URLs need the customer's credentials:
 * they are sent from here only, to Twilio's own host, and not on to the short-lived link Twilio
 * redirects to. Range is passed through, or served from the full file when the provider ignores it,
 * so the player always knows the length and can seek. `?download=1` answers as an attachment
 * named after the call.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONTENT_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav' } as const;
/** Well inside Telnyx's link lifetime (10 minutes). */
const SOURCE_TTL_MS = 2 * 60_000;
const MAX_CACHED = 500;

type RecordingSource = {
    url: string;
    format: keyof typeof CONTENT_TYPES;
    filename: string;
    /** VoiceLink links may only answer from India: if we cannot fetch one, the browser may. */
    redirectOnFailure: boolean;
    /** Sent with the first request only (Twilio). */
    authorization?: string;
    expiresAt: number;
};

/** Redirects followed by hand when credentials are sent, so they never leave the provider's host. */
const MAX_REDIRECTS = 3;

const sources = new Map<string, RecordingSource>();

function json(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function slug(text: string): string {
    return (
        text
            .normalize('NFKD')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, '-')
            .slice(0, 40) || 'agent'
    );
}

/**
 * Links come from the provider (Telnyx's or Twilio's API, or VoiceLink's webhook via the engine). Outside
 * tests only public https hosts are fetched, so a crafted link cannot point the server inward.
 */
function isFetchableLink(link: string): boolean {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return false;
    }
    if (process.env.NODE_ENV !== 'production') return url.protocol === 'https:' || url.protocol === 'http:';
    const host = url.hostname.toLowerCase();
    const ipLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
    return url.protocol === 'https:' && !ipLiteral && host !== 'localhost' && !host.endsWith('.localhost') && host.includes('.');
}

async function resolveSource(userId: string, callId: string): Promise<RecordingSource | NextResponse> {
    const key = `${userId}:${callId}`;
    const cached = sources.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const callRes = await getCall(callId);
    if (!callRes.success || !callRes.data) return json(404, callRes.error ?? 'Call not found');
    let recording: CallRecordingSource;
    try {
        recording = await findOwnedCallRecording(userId, callId);
    } catch (error) {
        console.error('[voice] recording lookup failed', error);
        return json(502, getActionErrorMessage(error, 'Could not fetch the recording'));
    }
    if (!recording.available) return json(404, recording.reason);
    if (!isFetchableLink(recording.url)) return json(502, 'The provider sent a recording link we cannot open');

    const date = callRes.data.startedAt.slice(0, 10);
    const source: RecordingSource = {
        url: recording.url,
        format: recording.format,
        filename: `call-${date}-${slug(callRes.data.agentName ?? 'deleted agent')}.${recording.format}`,
        redirectOnFailure: recording.storedBy === 'VoiceLink',
        authorization: recording.authorization,
        expiresAt: Date.now() + SOURCE_TTL_MS,
    };
    for (const [k, v] of sources) if (v.expiresAt <= Date.now() || sources.size >= MAX_CACHED) sources.delete(k);
    sources.set(key, source);
    return source;
}

/**
 * GET the recording. With credentials, redirects are followed by hand and the credentials go to
 * the first host only (Twilio sends its media on to a pre-signed link that must not get them).
 */
async function fetchRecording(source: RecordingSource, range: string | null, signal: AbortSignal): Promise<Response> {
    const rangeHeader: Record<string, string> = range ? { Range: range } : {};
    if (!source.authorization) {
        return fetch(source.url, { headers: rangeHeader, cache: 'no-store', signal });
    }
    let url = source.url;
    let headers: Record<string, string> = { ...rangeHeader, Authorization: source.authorization };
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetch(url, { headers, cache: 'no-store', signal, redirect: 'manual' });
        const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!location) return res;
        const next = new URL(location, url);
        if (!isFetchableLink(next.toString())) {
            throw new Error('The provider redirected the recording somewhere we cannot open');
        }
        if (next.origin !== new URL(url).origin) headers = { ...rangeHeader };
        url = next.toString();
    }
    throw new Error('Too many redirects for the recording');
}

/** `bytes=a-b` / `bytes=a-` / `bytes=-n` against `size`; null when it does not fit. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return null;
    let start: number;
    let end: number;
    if (!match[1]) {
        start = Math.max(0, size - Number(match[2]));
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    return start <= end && start < size ? { start, end } : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
    const session = await getAppSession();
    if (!session?.user?.id) return json(401, 'Unauthorized');

    const { callId } = await params;
    if (!isValidObjectId(callId)) return json(404, 'Call not found');

    const source = await resolveSource(session.user.id, callId);
    if (source instanceof NextResponse) return source;

    const download = request.nextUrl.searchParams.get('download') === '1';
    const range = request.headers.get('range');
    const headers = new Headers({
        'Content-Type': CONTENT_TYPES[source.format],
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${source.filename}"`,
    });

    let upstream: Response;
    try {
        upstream = await fetchRecording(source, range, request.signal);
    } catch {
        sources.delete(`${session.user.id}:${callId}`);
        if (source.redirectOnFailure) return NextResponse.redirect(source.url, 302);
        return json(502, 'Could not reach the recording. Try again in a moment.');
    }

    if (upstream.status === 416) {
        headers.set('Content-Range', upstream.headers.get('content-range') ?? 'bytes */*');
        return new NextResponse(null, { status: 416, headers });
    }
    if (!upstream.ok || !upstream.body) {
        // An expired or revoked link: forget it so the next request asks the provider again.
        sources.delete(`${session.user.id}:${callId}`);
        if (source.redirectOnFailure) return NextResponse.redirect(source.url, 302);
        return json(502, 'The provider did not hand the recording over. Try again in a moment.');
    }

    // fetch() undoes any Content-Encoding, so the provider's length only holds for an unencoded body.
    const sameBytes = !upstream.headers.get('content-encoding');
    if (upstream.status === 206) {
        const contentRange = upstream.headers.get('content-range');
        const length = upstream.headers.get('content-length');
        if (contentRange) headers.set('Content-Range', contentRange);
        if (length && sameBytes) headers.set('Content-Length', length);
        return new NextResponse(upstream.body, { status: 206, headers });
    }

    if (range) {
        // The provider ignored Range: answer it from the whole file (recordings are a few MB).
        const file = Buffer.from(await upstream.arrayBuffer());
        const part = parseRange(range, file.length);
        if (!part) {
            headers.set('Content-Range', `bytes */${file.length}`);
            return new NextResponse(null, { status: 416, headers });
        }
        headers.set('Content-Range', `bytes ${part.start}-${part.end}/${file.length}`);
        headers.set('Content-Length', String(part.end - part.start + 1));
        return new NextResponse(file.subarray(part.start, part.end + 1), { status: 206, headers });
    }

    const length = upstream.headers.get('content-length');
    if (length && sameBytes) headers.set('Content-Length', length);
    return new NextResponse(upstream.body, { status: 200, headers });
}
