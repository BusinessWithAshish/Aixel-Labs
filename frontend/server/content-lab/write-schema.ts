import 'server-only';

import { z } from 'zod';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_WRITE_FORMATS } from '@aixellabs/backend/db/types';
import type { CONTENT_LAB_WRITE_REQUEST } from '@/helpers/content-lab-api';

/** What a write request may carry: checked by the Write route and by scheduled board runs alike. */

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

export const CONTENT_LAB_WRITE_REQUEST_SCHEMA: z.ZodType<CONTENT_LAB_WRITE_REQUEST, unknown> = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('draft'), format: z.enum(CONTENT_LAB_WRITE_FORMATS), language: LANGUAGE_SCHEMA, context: CONTEXT_SCHEMA }),
    z.object({
        mode: z.literal('rewrites'),
        draft: text(500).min(1),
        platform: z.enum(CONTENT_LAB_PLATFORMS),
        language: LANGUAGE_SCHEMA,
        context: CONTEXT_SCHEMA,
    }),
]);
