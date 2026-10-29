import { NextResponse } from 'next/server';
import { MongoObjectId } from '@aixellabs/backend/db';
import type { CONTENT_LAB_WRITE_RESPONSE } from '@/helpers/content-lab-api';
import { CONTENT_LAB_AI_KEY_MISSING, loadContentLabAiKey } from '@/server/content-lab/ai-key';
import { contentLabError, readContentLabBody } from '@/server/content-lab/backend';
import { buildWritePrompt, generateWithGemini, parseVersions } from '@/server/content-lab/gemini';
import { CONTENT_LAB_WRITE_REQUEST_SCHEMA } from '@/server/content-lab/write-schema';

export const maxDuration = 300;

function isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Writes a draft, or 3 stronger versions of a title/hook, on the owner's own Content Lab Gemini key. */
export async function POST(request: Request) {
    const read = await readContentLabBody(request, CONTENT_LAB_WRITE_REQUEST_SCHEMA);
    if ('response' in read) return read.response;

    const key = await loadContentLabAiKey(new MongoObjectId(read.session.user.id));
    if (!key) return contentLabError(CONTENT_LAB_AI_KEY_MISSING, 400);

    try {
        const out = await generateWithGemini({ key, ...buildWritePrompt(read.body), signal: request.signal });
        const data: CONTENT_LAB_WRITE_RESPONSE = read.body.mode === 'draft' ? { text: out } : { versions: parseVersions(out) };
        return NextResponse.json({ success: true, data });
    } catch (error) {
        if (request.signal.aborted) return contentLabError('Request cancelled', 499);
        if (isAbortError(error)) return contentLabError('Gemini took too long. Try again.', 504);
        if (error instanceof SyntaxError) return contentLabError('Gemini did not return 3 versions. Try again.', 502);
        return contentLabError(error instanceof Error ? error.message : 'Could not write this', 502);
    }
}
