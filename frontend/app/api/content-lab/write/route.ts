import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_WRITE_FORMATS, MongoObjectId } from '@aixellabs/backend/db';
import type { CONTENT_LAB_WRITE_REQUEST, CONTENT_LAB_WRITE_RESPONSE } from '@/helpers/content-lab-api';
import { contentLabError, readContentLabBody } from '@/server/content-lab/backend';
import {
    buildWritePrompt,
    CONTENT_LAB_GEMINI_KEY_MISSING,
    generateWithGemini,
    loadOwnerGeminiKey,
    parseVersions,
} from '@/server/content-lab/gemini';

export const maxDuration = 300;

const text = (max: number) => z.string().trim().max(max);

const CONTEXT_SCHEMA = z.object({
    topic: text(200).optional(),
    voice: z.array(text(500)).max(20).optional(),
    examples: z
        .array(
            z.object({
                title: text(500),
                url: text(500).optional(),
                hook: text(1000).nullish(),
                structure: z.array(text(200)).max(30).optional(),
                cta: text(500).nullish(),
                text: text(20_000).nullish(),
            }),
        )
        .max(10)
        .optional(),
    patterns: z.array(text(300)).max(20).optional(),
    note: text(2000).optional(),
});

const LANGUAGE_SCHEMA = text(40).min(1);

const WRITE_REQUEST_SCHEMA: z.ZodType<CONTENT_LAB_WRITE_REQUEST, z.ZodTypeDef, unknown> = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('draft'), format: z.enum(CONTENT_LAB_WRITE_FORMATS), language: LANGUAGE_SCHEMA, context: CONTEXT_SCHEMA }),
    z.object({
        mode: z.literal('rewrites'),
        draft: text(500).min(1),
        platform: z.enum(CONTENT_LAB_PLATFORMS),
        language: LANGUAGE_SCHEMA,
        context: CONTEXT_SCHEMA,
    }),
]);

function isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Writes a draft, or 3 stronger versions of a title/hook, on the owner's own Gemini key. */
export async function POST(request: Request) {
    const read = await readContentLabBody(request, WRITE_REQUEST_SCHEMA);
    if ('response' in read) return read.response;

    const key = await loadOwnerGeminiKey(new MongoObjectId(read.session.user.id));
    if (!key) return contentLabError(CONTENT_LAB_GEMINI_KEY_MISSING, 400);

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
