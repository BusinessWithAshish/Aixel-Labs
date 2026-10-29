import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type {
    CONTENT_LAB_BREAKDOWN_REQUEST,
    CONTENT_LAB_BREAKDOWN_RESPONSE,
    CONTENT_LAB_CHECK_REQUEST,
    CONTENT_LAB_CHECK_RESPONSE,
    CONTENT_LAB_CREATOR_REQUEST,
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_REQUEST,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_POST,
    CONTENT_LAB_TEXT_SIGNALS,
    ContentLabPlatform,
} from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_LIMITS, CONTENT_LAB_OUTLIER_MULTIPLE } from '@aixellabs/backend/content-lab/constants';
import {
    ContentLabNodeKind,
    type ContentLabBoardEdge,
    type ContentLabBoardNode,
    type ContentLabNodeRunResult,
    type ContentLabProfile,
    type ContentLabStandout,
    type ContentLabWriteFormat,
} from '@aixellabs/backend/db/types';
import type {
    CONTENT_LAB_ADS_REQUEST,
    CONTENT_LAB_ADS_RESPONSE,
    CONTENT_LAB_WRITE_REQUEST,
    CONTENT_LAB_WRITE_RESPONSE,
    ContentLabWriteContext,
    ContentLabWriteExample,
} from '@/helpers/content-lab-api';
import { CONTENT_LAB_DEFAULT_LANGUAGE, CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import { counted, toneAccounts } from './flow';
import { topoLevels } from './graph';

/** What a node passes to the nodes wired from it. */
type Carry = {
    posts: CONTENT_LAB_POST[];
    breakdowns: CONTENT_LAB_BREAKDOWN_RESPONSE[];
    examples: ContentLabWriteExample[];
    patterns: string[];
    voice: string[];
    notes: string[];
    topic?: string;
    /** Write → Output. */
    context?: ContentLabWriteContext;
    language?: string;
    format?: ContentLabWriteFormat;
    /** Output → Check. */
    text?: string;
};

export type BoardRunItem = NonNullable<ContentLabNodeRunResult['items']>[number];

/** One node's run, shown inside it: what a stored run keeps, plus "running" and what it hands on. */
export type BoardNodeRun = Omit<ContentLabNodeRunResult, 'status'> & {
    status: 'running' | ContentLabNodeRunResult['status'];
    carry?: Partial<Carry>;
};

/**
 * Where a run gets its data and drafts. The browser passes the BFF (`contentLabApi`, signed-in
 * session); the scheduler passes server-side calls on the board owner's behalf. Same answers either way.
 */
export type BoardRunDeps = {
    explore: (body: CONTENT_LAB_EXPLORE_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_EXPLORE_RESPONSE>>;
    breakdown: (body: CONTENT_LAB_BREAKDOWN_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_BREAKDOWN_RESPONSE>>;
    check: (body: CONTENT_LAB_CHECK_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_CHECK_RESPONSE>>;
    creator: (body: CONTENT_LAB_CREATOR_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_CREATOR_RESPONSE>>;
    write: (body: CONTENT_LAB_WRITE_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_WRITE_RESPONSE>>;
    ads: (body: CONTENT_LAB_ADS_REQUEST, signal: AbortSignal) => Promise<ALApiResponse<CONTENT_LAB_ADS_RESPONSE>>;
    /** The owner's watchlist: each watched creator's standout posts. */
    watches: () => Promise<ALApiResponse<{ handle: string; standouts: ContentLabStandout[] }[]>>;
};

export type RunBoardInput = {
    nodes: ContentLabBoardNode[];
    edges: ContentLabBoardEdge[];
    profile: Pick<ContentLabProfile, 'handles' | 'country'>;
    deps: BoardRunDeps;
    signal: AbortSignal;
    onNode: (id: string, run: BoardNodeRun) => void;
    /** A Write fan-out finished one Output's draft (it belongs on the board). */
    onOutputText: (id: string, text: string, format: ContentLabWriteFormat) => void;
};

const EXAMPLES_PER_INPUT = 6;
const VOICE_POSTS = 8;

const SIGNAL_PHRASES: [keyof CONTENT_LAB_TEXT_SIGNALS, string][] = [
    ['hasNumber', 'open with a number'],
    ['hasPrice', 'put a price or budget up front'],
    ['isListicle', 'are lists ("7 ways…")'],
    ['isChallenge', 'are a challenge or test ("I tried…")'],
    ['hasPov', 'use a POV hook'],
    ['hasQuestion', 'ask a question'],
];

/** Hook, structure and CTA patterns shared by the posts wired into a Hooks node. */
export function buildHookPatterns(posts: CONTENT_LAB_POST[], breakdowns: CONTENT_LAB_BREAKDOWN_RESPONSE[]): string[] {
    const byId = new Map([...posts, ...breakdowns.map((b) => b.post)].map((post) => [post.id, post]));
    const all = [...byId.values()];
    const lines: string[] = [];
    if (all.length) {
        const n = all.length;
        for (const [key, phrase] of SIGNAL_PHRASES) {
            const count = all.filter((post) => post.signals?.[key]).length;
            if (count > 0 && (n < 3 || count >= Math.ceil(n / 3))) lines.push(`${count} of ${n} ${phrase}`);
        }
        const reasons = new Map<string, number>();
        all.flatMap((post) => post.reasons ?? []).forEach((reason) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1));
        [...reasons.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .forEach(([reason, count]) => lines.push(`${reason} (${count} of ${n})`));
        const lengths = all.map((post) => post.signals?.length ?? post.title.length);
        lines.push(`Titles run about ${Math.round(lengths.reduce((a, b) => a + b, 0) / n)} characters`);
    }
    for (const b of breakdowns) {
        if (b.hook.text) lines.push(`Hook${b.hook.type ? ` (${b.hook.type})` : ''}: “${b.hook.text}”`);
        if (b.structure.length) lines.push(`Structure: ${b.structure.map((part) => part.label).join(' → ')}`);
        if (b.cta?.text) lines.push(`CTA: “${b.cta.text}”`);
    }
    return lines.slice(0, 10);
}

const postItem = (post: CONTENT_LAB_POST): BoardRunItem => ({
    label: post.title,
    detail: `${post.creator.handle ? `@${post.creator.handle}` : (post.creator.name ?? '')} · ${CONTENT_LAB_PLATFORM_LABELS[post.platform]}`,
    url: post.url,
    multiple: post.multiple,
});

const postExample = (post: CONTENT_LAB_POST): ContentLabWriteExample => ({ title: post.title, url: post.url });

/** Which platform's top posts a draft is checked against. */
const CHECK_PLATFORM: Partial<Record<ContentLabWriteFormat, ContentLabPlatform>> = {
    'youtube-script': 'youtube',
    reel: 'instagram',
    carousel: 'instagram',
};

function unwrap<T>(response: ALApiResponse<T>): T {
    if (!response.success || response.data === undefined) throw new Error(response.error ?? 'Request failed');
    return response.data;
}

/** Everything the nodes wired into `id` carry, merged. */
function gather(inputs: Partial<Carry>[]): Carry {
    return {
        posts: inputs.flatMap((c) => c.posts ?? []),
        breakdowns: inputs.flatMap((c) => c.breakdowns ?? []),
        examples: inputs.flatMap((c) => c.examples ?? []),
        patterns: inputs.flatMap((c) => c.patterns ?? []),
        voice: inputs.flatMap((c) => c.voice ?? []),
        notes: inputs.flatMap((c) => c.notes ?? []),
        topic: inputs.find((c) => c.topic)?.topic,
    };
}

const firstLine = (text: string) =>
    (text.split('\n').find((line) => line.trim()) ?? '').trim().slice(0, CONTENT_LAB_LIMITS.maxCheckTextChars);

/**
 * Runs a board in wiring order: inputs (explore / creator / breakdown / ads / watchlist / own tone)
 * → Hooks (patterns from the posts wired in) → Write (a brief from everything wired in) → each Output
 * wired from it, drafted in its own format → Check (scores that Output). A failed node shows its error;
 * the nodes after it still run on what the others found. Each node says what it `sent` down its wires.
 * Runs in the browser (Run board) and on the server (scheduled runs) with different `deps`.
 */
export async function runBoard({ nodes, edges, profile, deps, signal, onNode, onOutputText }: RunBoardInput): Promise<void> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const done = new Map<string, Partial<Carry>>();
    const inputsOf = (id: string) =>
        edges
            .filter((edge) => edge.target === id && byId.has(edge.source))
            .map((edge) => ({ node: byId.get(edge.source)!, carry: done.get(edge.source) }));
    const country = profile.country;

    async function runNode(node: ContentLabBoardNode): Promise<BoardNodeRun | null> {
        const { data } = node;
        const inputs = inputsOf(node.id);
        const carried = gather(inputs.map((input) => input.carry ?? {}));

        switch (node.kind) {
            case ContentLabNodeKind.VOICE: {
                const own = toneAccounts(profile);
                if (!own.length) throw new Error('No accounts to learn your tone from. Connect yours in Content Lab Settings.');
                const results = await Promise.all(
                    own.map(async ({ platform, handle }) => ({
                        platform,
                        handle,
                        data: unwrap(await deps.creator({ platform, handle, country, limit: 12 }, signal)),
                    })),
                );
                const voice = results.flatMap((result) => result.data.posts.slice(0, VOICE_POSTS).map((post) => post.title));
                return {
                    status: 'done',
                    summary: `Learned your tone from ${counted(voice.length, 'of your posts', 'of your posts')}`,
                    items: results.map((result) => ({
                        label: `@${result.handle}`,
                        detail: `${CONTENT_LAB_PLATFORM_LABELS[result.platform]} · ${counted(result.data.posts.length, 'recent post', 'recent posts')}`,
                    })),
                    sent: `your tone (${counted(voice.length, 'post', 'posts')})`,
                    carry: { voice },
                };
            }
            case ContentLabNodeKind.WORKING: {
                const query = data.query?.trim();
                if (!query) throw new Error('Type a topic first');
                const result = unwrap(
                    await deps.explore(
                        { query, platforms: data.platforms?.length ? data.platforms : undefined, country: data.country || country },
                        signal,
                    ),
                );
                const posts = result.posts.slice(0, 12);
                return {
                    status: 'done',
                    summary: `${counted(result.niche.outlierCount, 'standout post', 'standout posts')} out of ${result.niche.postCount} looked at`,
                    items: posts.slice(0, 3).map(postItem),
                    sent: counted(posts.length, 'top post', 'top posts'),
                    carry: { posts, examples: posts.slice(0, EXAMPLES_PER_INPUT).map(postExample), topic: query },
                };
            }
            case ContentLabNodeKind.CREATOR: {
                const handle = data.handle?.trim();
                if (!handle) throw new Error('Type a creator handle first');
                const result = unwrap(await deps.creator({ platform: data.platform ?? 'youtube', handle, country }, signal));
                const ranked = [...result.posts].sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));
                const standouts = ranked.filter((post) => (post.multiple ?? 0) >= CONTENT_LAB_OUTLIER_MULTIPLE);
                const posts = (standouts.length ? standouts : ranked).slice(0, EXAMPLES_PER_INPUT);
                return {
                    status: 'done',
                    summary: `${counted(standouts.length, 'post', 'posts')} beat their usual views`,
                    items: posts.slice(0, 3).map(postItem),
                    sent: counted(posts.length, 'best post', 'best posts'),
                    carry: { posts, examples: posts.map(postExample) },
                };
            }
            case ContentLabNodeKind.WATCHING: {
                const watches = unwrap(await deps.watches());
                const standouts = watches
                    .flatMap((watch) => watch.standouts.map((standout) => ({ ...standout, handle: watch.handle })))
                    .sort((a, b) => b.multiple - a.multiple)
                    .slice(0, EXAMPLES_PER_INPUT);
                return {
                    status: 'done',
                    summary: watches.length
                        ? `${counted(standouts.length, 'standout post', 'standout posts')} from ${counted(watches.length, 'creator', 'creators')}`
                        : 'You are not watching anyone yet',
                    items: standouts.slice(0, 3).map((s) => ({ label: s.title, detail: `@${s.handle}`, url: s.url, multiple: s.multiple })),
                    sent: counted(standouts.length, 'standout post', 'standout posts'),
                    carry: { examples: standouts.map((s) => ({ title: s.title, url: s.url })) },
                };
            }
            case ContentLabNodeKind.POST: {
                const url = data.url?.trim();
                if (!url) throw new Error('Paste a YouTube or Instagram link first');
                const breakdown = unwrap(await deps.breakdown({ url, country }, signal));
                const { post } = breakdown;
                return {
                    status: 'done',
                    summary: post.multiple ? `${post.multiple}x its creator's usual views` : post.title,
                    lines: [...(breakdown.hook.text ? [`Hook: “${breakdown.hook.text}”`] : []), ...breakdown.whyItWorked.slice(0, 3)],
                    sent: 'hook, structure and call to action',
                    carry: {
                        breakdowns: [breakdown],
                        examples: [
                            {
                                title: post.title,
                                url: post.url,
                                hook: breakdown.hook.text,
                                structure: breakdown.structure.map((part) => part.label),
                                cta: breakdown.cta?.text ?? null,
                                text: breakdown.text?.slice(0, 4_000) ?? null,
                            },
                        ],
                        topic: post.title,
                    },
                };
            }
            case ContentLabNodeKind.ADS: {
                const query = data.query?.trim();
                if (!query) throw new Error('Type a topic or competitor first');
                const result = unwrap(await deps.ads({ query, region: data.country || country, limit: 12 }, signal));
                if (!result.available) return { status: 'done', notice: 'Ad library not connected yet', sent: 'no ads yet', carry: { topic: query } };
                const ads = result.ads.filter((ad) => ad.text);
                const sent = ads.slice(0, EXAMPLES_PER_INPUT);
                return {
                    status: 'done',
                    summary: counted(ads.length, 'ad', 'ads'),
                    items: ads.slice(0, 3).map((ad) => ({ label: ad.text!, detail: ad.advertiser, url: ad.url ?? undefined })),
                    sent: counted(sent.length, 'ad', 'ads'),
                    carry: { examples: sent.map((ad) => ({ title: ad.text!, url: ad.url ?? undefined })), topic: query },
                };
            }
            case ContentLabNodeKind.NOTE: {
                const text = data.text?.trim();
                return { status: 'done', sent: text ? 'your note' : 'nothing (empty note)', carry: { notes: text ? [text] : [] } };
            }
            case ContentLabNodeKind.HOOKS: {
                if (!carried.posts.length && !carried.breakdowns.length && !carried.examples.length) {
                    throw new Error("Nothing to learn from yet. Plug in What's working, Creator, Post or Watching.");
                }
                const patterns = buildHookPatterns(carried.posts, carried.breakdowns);
                return {
                    status: 'done',
                    summary: `What ${counted(carried.examples.length, 'post', 'posts')} have in common`,
                    lines: patterns,
                    sent: `${counted(patterns.length, 'hook pattern', 'hook patterns')} + ${counted(carried.examples.length, 'example', 'examples')}`,
                    carry: { ...carried, patterns },
                };
            }
            case ContentLabNodeKind.WRITE: {
                const context: ContentLabWriteContext = {
                    topic: carried.topic,
                    voice: carried.voice.slice(0, 16),
                    examples: carried.examples.slice(0, 10),
                    patterns: carried.patterns.slice(0, 12),
                    note: carried.notes.join('\n') || undefined,
                };
                const uses = [
                    context.voice?.length ? 'your tone' : null,
                    context.examples?.length ? counted(context.examples.length, 'example', 'examples') : null,
                    context.patterns?.length ? counted(context.patterns.length, 'hook pattern', 'hook patterns') : null,
                    context.note ? 'your note' : null,
                ].filter((use): use is string => !!use);
                return {
                    status: 'done',
                    summary: uses.length ? `Brief built from ${uses.join(', ')}` : 'Nothing plugged in: writing from the topic only',
                    sent: uses.length ? `brief: ${uses.join(', ')}` : 'brief: topic only',
                    carry: { context, language: data.language || CONTENT_LAB_DEFAULT_LANGUAGE, format: data.format, topic: carried.topic },
                };
            }
            case ContentLabNodeKind.OUTPUT: {
                const writer = inputs.find((input) => input.carry?.context)?.carry;
                if (!writer?.context) {
                    // Not fed by a Write node: the user's own text is the draft.
                    return data.text?.trim()
                        ? { status: 'done', sent: 'your draft', carry: { text: data.text, format: data.format, topic: carried.topic } }
                        : null;
                }
                const format = data.format ?? writer.format ?? 'reel';
                const result = unwrap(
                    await deps.write(
                        { mode: 'draft', format, language: writer.language ?? CONTENT_LAB_DEFAULT_LANGUAGE, context: writer.context },
                        signal,
                    ),
                );
                if (!('text' in result)) throw new Error('The writer did not return a draft');
                onOutputText(node.id, result.text, format);
                const words = result.text.split(/\s+/).filter(Boolean).length;
                return {
                    status: 'done',
                    summary: `Draft written (${counted(words, 'word', 'words')})`,
                    sent: 'draft',
                    carry: { text: result.text, format, topic: writer.topic },
                };
            }
            case ContentLabNodeKind.CHECK: {
                const draft = inputs.find((input) => input.carry?.text)?.carry;
                if (!draft?.text) throw new Error('No draft to score. Plug in an Output that has a draft.');
                const platform = draft.format ? CHECK_PLATFORM[draft.format] : 'instagram';
                if (!platform) throw new Error('Checks score YouTube and Instagram drafts for now');
                const text = firstLine(draft.text);
                const check = unwrap(await deps.check({ text, platform, query: draft.topic || carried.topic || text, country }, signal));
                return { status: 'done', check: { score: check.score, checks: check.checks }, carry: {} };
            }
        }
    }

    const levels = topoLevels(
        nodes.map((node) => node.id),
        edges,
    );
    const runOne = async (id: string) => {
        if (signal.aborted) return;
        const node = byId.get(id)!;
        onNode(id, { status: 'running' });
        try {
            const run = await runNode(node);
            if (run) {
                done.set(id, run.carry ?? {});
                onNode(id, run);
            } else {
                done.set(id, {});
                onNode(id, { status: 'done', summary: 'Nothing to do yet' });
            }
        } catch (error) {
            done.set(id, {});
            onNode(id, { status: 'error', error: signal.aborted ? 'Stopped' : error instanceof Error ? error.message : 'Failed' });
        }
    };
    for (const level of levels) {
        if (signal.aborted) return;
        // Inputs run side by side; drafts one at a time, so a free-tier key's per-minute limit is not hit at once.
        await Promise.all(level.filter((id) => byId.get(id)!.kind !== ContentLabNodeKind.OUTPUT).map(runOne));
        for (const id of level.filter((id) => byId.get(id)!.kind === ContentLabNodeKind.OUTPUT)) await runOne(id);
    }
}

/** A finished node's run as stored with a scheduled run (no carry, nothing still running). */
export function storedNodeRun({ status, error, summary, notice, items, lines, check, sent }: BoardNodeRun): ContentLabNodeRunResult {
    const fields = { error, summary, notice, items, lines, check, sent };
    const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<typeof fields>;
    return { ...set, status: status === 'error' ? 'error' : 'done' };
}
