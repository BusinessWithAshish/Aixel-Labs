import { NextResponse } from 'next/server';
import { getActionErrorMessage, requireUserObjectId } from '@/helpers/server-action-helpers';
import { getAppSession } from '@/server/auth';
import { SampleUnavailable, voiceSample } from '@/server/voice-agent/voice-samples';

/** A built-in voice with no shipped sample saying one sentence, for the voice picker's play button (`voiceSampleUrl`). */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function json(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string; voiceId: string }> }) {
    const session = await getAppSession();
    if (!session?.user?.id) return json(401, 'Unauthorized');
    const { provider, voiceId } = await params;
    try {
        const sample = await voiceSample(requireUserObjectId(session.user.id), provider, decodeURIComponent(voiceId));
        if (!sample) return json(404, 'No sample for this voice');
        return new NextResponse(sample.audio, {
            headers: {
                'Content-Type': sample.contentType,
                // A stock voice saying a fixed sentence: the same for everyone, so the CDN keeps it.
                'Cache-Control': 'public, max-age=604800, s-maxage=31536000, immutable',
            },
        });
    } catch (error) {
        if (error instanceof SampleUnavailable) return json(error.status, error.message);
        return json(503, getActionErrorMessage(error, 'Sample unavailable right now, try again in a minute.'));
    }
}
