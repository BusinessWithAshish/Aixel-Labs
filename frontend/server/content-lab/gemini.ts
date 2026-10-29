import 'server-only';

import type { ContentLabWriteFormat } from '@aixellabs/backend/db/types';
import { MEDIA_GEMINI_MODEL } from '@aixellabs/backend/media/constants';
import type { CONTENT_LAB_WRITE_REQUEST, ContentLabWriteContext } from '@/helpers/content-lab-api';
import { geminiApiBase } from '@/server/voice-agent/gemini-key';

/**
 * Content Lab writes on the owner's own Content Lab Gemini key (`loadContentLabAiKey` in ./ai-key,
 * not Voice agent's key). `GEMINI_API_BASE` points the calls at a fake in tests (default: Google's API).
 */

const GENERATE_TIMEOUT_MS = 120_000;
const EXAMPLE_TEXT_CHARS = 1_500;

const FORMAT_BRIEF: Record<ContentLabWriteFormat, string> = {
    'youtube-script':
        'A YouTube video script, 8-12 minutes spoken. Label the parts: HOOK (0:00), SETUP, the main parts with timestamps, a RE-HOOK around 40% in, PAYOFF, CTA. The hook is at most 2 sentences and sets the stakes in the first 6 seconds. Put on-screen text cues in [brackets].',
    reel: 'A short vertical video script (Instagram Reel / YouTube Short), 20-45 seconds. One line per beat with a timestamp (0:00, 0:02, ...). On-screen text in the first 1.5 seconds. A cut every 2-3 seconds. End on a payoff that makes people rewatch. Then "Caption:" with one clear CTA.',
    carousel:
        'An Instagram carousel of 6-10 slides, one line per slide as "Slide N: ...". Slide 1 is the cover: a number and a benefit. One idea per slide. The last slide asks people to save or share. Then "Caption:" in 2-4 lines.',
    'linkedin-post':
        'A LinkedIn post of 120-220 words. The first line is a hook that works before "see more". Short paragraphs, one idea each. End with a question or a CTA. At most 3 hashtags.',
    'x-thread':
        'An X thread of 5-8 posts, each under 280 characters, numbered "1/", "2/", ... The first post is the hook, the last a CTA.',
};

function languageRule(language: string): string {
    if (/hinglish/i.test(language)) {
        return 'Write in Hinglish: Hindi and English mixed the way Indian creators talk, Hindi words in Latin script (no Devanagari).';
    }
    return `Write in ${language}.`;
}

function contextBlock(context: ContentLabWriteContext): string {
    const parts: string[] = [];
    if (context.topic) parts.push(`TOPIC: ${context.topic}`);
    if (context.voice?.length) parts.push(`MY VOICE (my own recent titles/captions, match their tone):\n${context.voice.map((v) => `- ${v}`).join('\n')}`);
    if (context.patterns?.length) parts.push(`WHAT THE WINNERS SHARE:\n${context.patterns.map((p) => `- ${p}`).join('\n')}`);
    context.examples?.forEach((example, index) => {
        const lines = [`EXAMPLE ${index + 1}: ${example.title}`];
        if (example.hook) lines.push(`Hook: ${example.hook}`);
        if (example.structure?.length) lines.push(`Structure: ${example.structure.join(' → ')}`);
        if (example.cta) lines.push(`CTA: ${example.cta}`);
        if (example.text) lines.push(`Text: ${example.text.slice(0, EXAMPLE_TEXT_CHARS)}`);
        parts.push(lines.join('\n'));
    });
    if (context.note) parts.push(`MY NOTE: ${context.note}`);
    return parts.join('\n\n');
}

const SHARED_RULES = [
    'You write social media content for creators.',
    'Imitate the structure, hook type, pacing and CTA of the examples. Never copy their sentences, names, personal stories or exact numbers.',
    'Use concrete numbers, prices and stakes when they fit the topic.',
].join(' ');

/** System + user prompt and whether Gemini must answer in JSON, for one write request. */
export function buildWritePrompt(request: CONTENT_LAB_WRITE_REQUEST): { system: string; prompt: string; json: boolean } {
    const context = contextBlock(request.context);
    if (request.mode === 'draft') {
        return {
            system: `${SHARED_RULES} ${languageRule(request.language)} Reply with the content only: plain text, no markdown fences, no preamble.`,
            prompt: `Write this: ${FORMAT_BRIEF[request.format]}\n\n${context}`.trim(),
            json: false,
        };
    }
    const what =
        request.platform === 'youtube'
            ? 'YouTube title (under 70 characters)'
            : 'Instagram Reel hook / first caption line (under 125 characters)';
    return {
        system: `${SHARED_RULES} ${languageRule(request.language)} Reply with JSON only: {"versions": ["...", "...", "..."]}.`,
        prompt: `Give exactly 3 stronger versions of this ${what}. Keep its topic and promise; make each one more specific, with a number, price, stake or tension the winners use.\n\nDRAFT: ${request.draft}\n\n${context}`.trim(),
        json: true,
    };
}

type GeminiReply = {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
};

/** Google's refusal in plain words: key problems point at Settings, quota says so. */
function refusalMessage(status: number): string {
    if (status === 429) return 'Google says your Gemini key is out of quota right now. Try again in a minute, or check its plan in Google AI Studio.';
    if (status === 400 || status === 401 || status === 403) {
        return 'Google refused your Gemini key. Check it under Content Lab > Settings.';
    }
    return `Gemini could not write this right now (HTTP ${status}). Try again in a minute.`;
}

/** One generateContent call on the owner's key; returns the text (JSON text when `json`). Throws plain messages. */
export async function generateWithGemini(input: {
    key: string;
    system: string;
    prompt: string;
    json: boolean;
    signal: AbortSignal;
}): Promise<string> {
    const url = `${geminiApiBase()}/v1beta/models/${MEDIA_GEMINI_MODEL.DEFAULT}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.key },
        cache: 'no-store',
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(GENERATE_TIMEOUT_MS)]),
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
            generationConfig: {
                temperature: 0.9,
                ...(input.json
                    ? {
                          responseMimeType: 'application/json',
                          responseSchema: {
                              type: 'OBJECT',
                              properties: { versions: { type: 'ARRAY', items: { type: 'STRING' } } },
                              required: ['versions'],
                          },
                      }
                    : {}),
            },
        }),
    });
    if (!res.ok) throw new Error(refusalMessage(res.status));
    const reply = (await res.json().catch(() => ({}))) as GeminiReply;
    const text = (reply.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini returned nothing. Try again.');
    return text;
}

/** The 3 versions from a rewrites reply; tolerant of a stray code fence. */
export function parseVersions(text: string): string[] {
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(cleaned) as { versions?: unknown };
    const versions = Array.isArray(parsed.versions)
        ? parsed.versions.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
        : [];
    if (versions.length < 3) throw new Error('Gemini did not return 3 versions. Try again.');
    return versions.slice(0, 3);
}
