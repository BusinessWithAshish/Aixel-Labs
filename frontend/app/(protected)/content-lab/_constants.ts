import type { ContentLabFormat, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import {
    ContentLabNodeKind,
    type ContentLabBetaPlatform,
    type ContentLabBoardEdge,
    type ContentLabBoardNode,
    type ContentLabNodeData,
    type ContentLabWriteFormat,
} from '@aixellabs/backend/db/types';

/** What the Search box takes, each with what it gives back. Topic examples run a search when clicked. */
export const CONTENT_LAB_QUERY_KINDS = [
    {
        kind: 'topic',
        title: 'A topic, niche or keyword',
        examples: ['protein breakfast', 'skincare for men', 'Pune cafes'],
        gives: "Posts that got far more views than their creator's usual, on YouTube and Instagram, and why.",
    },
    {
        kind: 'link',
        title: 'A YouTube or Instagram link',
        examples: ['youtu.be/…', 'instagram.com/reel/…'],
        gives: 'That post broken down: hook, structure, CTA and thumbnail, ready to write your own version.',
    },
    {
        kind: 'creator',
        title: 'A creator',
        examples: ['@hostelkitchen'],
        gives: 'Their posts that beat their own usual, so you see what works for them.',
    },
] as const;

/** Why use this when YouTube Studio / Instagram insights exist: the short version, for the side card. */
export const CONTENT_LAB_VS_STUDIO = [
    { label: 'Whose posts', studio: 'Only yours', lab: "Anyone's" },
    { label: 'When', studio: 'After you post', lab: 'Before you post' },
    { label: 'You get', studio: 'Charts', lab: 'Why it worked + drafts' },
] as const;

/**
 * The worked example on Search home: one topic, a winner on each platform, the pattern they share
 * and that hook rewritten per platform. Illustrative (labelled "Example"), not live data.
 */
export const CONTENT_LAB_HOME_EXAMPLE = {
    query: 'protein breakfast',
    country: 'India',
    youtube: { title: 'I ate a 30g protein breakfast for 30 days', multiple: '12x', creator: '@fitwithriya' },
    instagram: { title: '30g protein. 5 minutes. No eggs.', multiple: '8x', creator: '@hostelkitchen' },
    pattern: 'A number and a result in the first words',
    evidence: '14 of 18 winners put a number in the title',
    hooks: [
        { platform: 'youtube', label: 'YouTube title', text: 'I tried 5 high-protein breakfasts (30g each)' },
        { platform: 'instagram', label: 'Reel, first line', text: '30g protein before 9am. No eggs.' },
        { platform: 'linkedin', label: 'LinkedIn opener', text: 'One number fixed my 3pm slump: 30g.' },
        { platform: 'x', label: 'X thread opener', text: '30g of protein at breakfast changed my workday. The 5-minute version 🧵' },
    ],
} as const;

/** Explore's platform toggle (`?platform=`). */
export const CONTENT_LAB_PLATFORM_FILTERS = [
    { value: 'both', label: 'YouTube + Instagram' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'instagram', label: 'Instagram' },
] as const;

export type ContentLabPlatformFilter = (typeof CONTENT_LAB_PLATFORM_FILTERS)[number]['value'];

export const CONTENT_LAB_POST_FORMAT_LABELS: Record<ContentLabFormat, string> = {
    video: 'Video',
    short: 'Short',
    reel: 'Reel',
    carousel: 'Carousel',
    post: 'Post',
};

/** What the smart box will do with what was typed. */
export const CONTENT_LAB_SMART_BOX_HINTS = {
    topic: 'shows what is working in this niche',
    link: 'breaks down this video or reel',
    creator: 'shows their posts that beat their usual',
} as const;

export const CONTENT_LAB_SMART_BOX_EXAMPLES = ['protein breakfast', 'https://youtu.be/abc123xyz', '@hostelkitchen'] as const;

// ─── Boards ──────────────────────────────────────────────────────────────────

export const CONTENT_LAB_PLATFORM_LABELS: Record<ContentLabPlatform | ContentLabBetaPlatform, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    x: 'X',
    linkedin: 'LinkedIn',
};

export const CONTENT_LAB_FORMAT_LABELS: Record<ContentLabWriteFormat, string> = {
    'youtube-script': 'YouTube script',
    reel: 'Reel',
    carousel: 'Carousel',
    'linkedin-post': 'LinkedIn post',
    'x-thread': 'X thread',
};

/** Countries offered for results; any ISO alpha-2 works in the API, these are the common ones. */
export const CONTENT_LAB_COUNTRIES = [
    { code: 'IN', label: 'India' },
    { code: 'US', label: 'United States' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'AE', label: 'UAE' },
    { code: 'CA', label: 'Canada' },
    { code: 'AU', label: 'Australia' },
    { code: 'SG', label: 'Singapore' },
] as const;

export const CONTENT_LAB_LANGUAGES = [
    'English',
    'Hinglish',
    'Hindi',
    'Marathi',
    'Tamil',
    'Telugu',
    'Bengali',
    'Gujarati',
    'Kannada',
    'Spanish',
] as const;

export const CONTENT_LAB_DEFAULT_LANGUAGE = 'English';

/** Auto = built from our data, Live = refreshes, You = your input. */
export type ContentLabNodeTag = 'auto' | 'live' | 'you';

export const CONTENT_LAB_NODE_TAG_LABELS: Record<ContentLabNodeTag, string> = { auto: 'Auto', live: 'Live', you: 'You' };

type NodeMeta = {
    label: string;
    tag: ContentLabNodeTag;
    hint: string;
    /** Takes wires in (left handle). */
    acceptsInput: boolean;
    /** Sends wires out (right handle). */
    givesOutput: boolean;
    /** Order in the mobile Flow view: inputs → Hooks → Write → Outputs → Check. */
    stage: number;
};

export const CONTENT_LAB_NODE_META: Record<ContentLabNodeKind, NodeMeta> = {
    [ContentLabNodeKind.VOICE]: { label: 'My voice', tag: 'auto', hint: 'Your own recent posts, from Settings', acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.WORKING]: { label: "What's working", tag: 'live', hint: 'Outliers for a topic', acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.CREATOR]: { label: 'Creator', tag: 'live', hint: "One creator's standout posts", acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.WATCHING]: { label: 'Watching', tag: 'live', hint: 'Standouts from your watchlist', acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.POST]: { label: 'Post', tag: 'auto', hint: "One post's breakdown", acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.ADS]: { label: 'Competitor ads', tag: 'live', hint: 'Ads running for a topic', acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.NOTE]: { label: 'Note', tag: 'you', hint: 'Your angle, in your words', acceptsInput: false, givesOutput: true, stage: 0 },
    [ContentLabNodeKind.HOOKS]: { label: 'Hooks, structure, CTAs', tag: 'auto', hint: 'Patterns from the posts wired in', acceptsInput: true, givesOutput: true, stage: 1 },
    [ContentLabNodeKind.WRITE]: { label: 'Write', tag: 'you', hint: 'Drafts on your own Gemini key', acceptsInput: true, givesOutput: true, stage: 2 },
    [ContentLabNodeKind.OUTPUT]: { label: 'Output', tag: 'you', hint: 'An editable draft', acceptsInput: true, givesOutput: true, stage: 3 },
    [ContentLabNodeKind.CHECK]: { label: 'Check before posting', tag: 'auto', hint: 'Scores the draft vs niche winners', acceptsInput: true, givesOutput: false, stage: 4 },
};

/** Inputs bring ideas in, steps read them and write, outputs are what you post (and its check). */
export type ContentLabNodeRole = 'input' | 'step' | 'output';

export const CONTENT_LAB_NODE_ROLES: Record<ContentLabNodeRole, { label: string; plural: string; hint: string }> = {
    input: { label: 'Input', plural: 'Inputs', hint: 'Where ideas come from: top posts, creators, ads, your voice' },
    step: { label: 'Step', plural: 'Steps', hint: 'AI reads what is wired in, finds the patterns and writes' },
    output: { label: 'Output', plural: 'Outputs', hint: 'The drafts you post, each checked against the winners' },
};

export const CONTENT_LAB_NODE_ROLE_ORDER: ContentLabNodeRole[] = ['input', 'step', 'output'];

/** A box's role follows its stage: inputs are stage 0, Hooks and Write are steps, Output and Check are outputs. */
export const nodeRole = (kind: ContentLabNodeKind): ContentLabNodeRole => {
    const { stage } = CONTENT_LAB_NODE_META[kind];
    return stage === 0 ? 'input' : stage <= 2 ? 'step' : 'output';
};

export const CONTENT_LAB_BOARD_TEMPLATE_IDS = ['reel-from-outliers', 'youtube-script', 'repurpose', 'why-it-won', 'ad-hooks'] as const;
export type ContentLabBoardTemplateId = (typeof CONTENT_LAB_BOARD_TEMPLATE_IDS)[number];

export type ContentLabBoardTemplate = {
    id: ContentLabBoardTemplateId;
    title: string;
    description: string;
    nodes: ContentLabBoardNode[];
    edges: ContentLabBoardEdge[];
};

const COL = 320;
const ROW = 230;
const node = (id: string, kind: ContentLabNodeKind, col: number, row: number, data: ContentLabNodeData = {}): ContentLabBoardNode => ({
    id,
    kind,
    x: col * COL,
    y: row * ROW,
    data,
});
const wires = (...pairs: [string, string][]): ContentLabBoardEdge[] =>
    pairs.map(([source, target]) => ({ id: `${source}->${target}`, source, target }));
const write = (format: ContentLabWriteFormat) => ({ format, language: CONTENT_LAB_DEFAULT_LANGUAGE });
const output = (format: ContentLabWriteFormat) => ({ format, text: '' });

/** Board templates: one per workflow seen in Poppy tutorials, so a board never starts blank. */
export const CONTENT_LAB_BOARD_TEMPLATES: ContentLabBoardTemplate[] = [
    {
        id: 'reel-from-outliers',
        title: 'Reel from niche outliers',
        description: 'Top reels in a niche → hooks → your reel script.',
        nodes: [
            node('voice', ContentLabNodeKind.VOICE, 0, 0),
            node('working', ContentLabNodeKind.WORKING, 0, 1, { query: '', platforms: ['instagram', 'youtube'], country: 'IN' }),
            node('note', ContentLabNodeKind.NOTE, 0, 2.2, { text: '' }),
            node('hooks', ContentLabNodeKind.HOOKS, 1, 1),
            node('write', ContentLabNodeKind.WRITE, 2, 1, write('reel')),
            node('output', ContentLabNodeKind.OUTPUT, 3, 1, output('reel')),
            node('check', ContentLabNodeKind.CHECK, 4, 1),
        ],
        edges: wires(['voice', 'write'], ['working', 'hooks'], ['hooks', 'write'], ['note', 'write'], ['write', 'output'], ['output', 'check']),
    },
    {
        id: 'youtube-script',
        title: 'YouTube script',
        description: 'Your voice + top videos on the topic → a full script.',
        nodes: [
            node('voice', ContentLabNodeKind.VOICE, 0, 0),
            node('working', ContentLabNodeKind.WORKING, 0, 1, { query: '', platforms: ['youtube'], country: 'IN' }),
            node('hooks', ContentLabNodeKind.HOOKS, 1, 1),
            node('write', ContentLabNodeKind.WRITE, 2, 1, write('youtube-script')),
            node('output', ContentLabNodeKind.OUTPUT, 3, 1, output('youtube-script')),
            node('check', ContentLabNodeKind.CHECK, 4, 1),
        ],
        edges: wires(['voice', 'write'], ['working', 'hooks'], ['hooks', 'write'], ['write', 'output'], ['output', 'check']),
    },
    {
        id: 'repurpose',
        title: 'Repurpose one video',
        description: 'One long video → Reel, carousel, LinkedIn post and X thread.',
        nodes: [
            node('voice', ContentLabNodeKind.VOICE, 0, 0),
            node('post', ContentLabNodeKind.POST, 0, 1, { url: '' }),
            node('hooks', ContentLabNodeKind.HOOKS, 1, 1),
            node('write', ContentLabNodeKind.WRITE, 2, 1, write('reel')),
            node('reel', ContentLabNodeKind.OUTPUT, 3, 0, output('reel')),
            node('carousel', ContentLabNodeKind.OUTPUT, 3, 1, output('carousel')),
            node('linkedin', ContentLabNodeKind.OUTPUT, 3, 2, output('linkedin-post')),
            node('x', ContentLabNodeKind.OUTPUT, 3, 3, output('x-thread')),
        ],
        edges: wires(
            ['voice', 'write'],
            ['post', 'hooks'],
            ['hooks', 'write'],
            ['write', 'reel'],
            ['write', 'carousel'],
            ['write', 'linkedin'],
            ['write', 'x'],
        ),
    },
    {
        id: 'why-it-won',
        title: 'Why did it win?',
        description: 'Any post vs its creator’s usual → what to copy.',
        nodes: [
            node('post', ContentLabNodeKind.POST, 0, 1, { url: '' }),
            node('note', ContentLabNodeKind.NOTE, 0, 2, { text: '' }),
            node('hooks', ContentLabNodeKind.HOOKS, 1, 1),
            node('write', ContentLabNodeKind.WRITE, 2, 1, write('reel')),
            node('output', ContentLabNodeKind.OUTPUT, 3, 1, output('reel')),
            node('check', ContentLabNodeKind.CHECK, 4, 1),
        ],
        edges: wires(['post', 'hooks'], ['hooks', 'write'], ['note', 'write'], ['write', 'output'], ['output', 'check']),
    },
    {
        id: 'ad-hooks',
        title: 'Ad hooks from competitors',
        description: 'Competitor ads on a topic → their hooks → your ad script.',
        nodes: [
            node('voice', ContentLabNodeKind.VOICE, 0, 0),
            node('ads', ContentLabNodeKind.ADS, 0, 1, { query: '', country: 'IN' }),
            node('hooks', ContentLabNodeKind.HOOKS, 1, 1),
            node('write', ContentLabNodeKind.WRITE, 2, 1, write('reel')),
            node('output', ContentLabNodeKind.OUTPUT, 3, 1, output('reel')),
            node('check', ContentLabNodeKind.CHECK, 4, 1),
        ],
        edges: wires(['voice', 'write'], ['ads', 'hooks'], ['hooks', 'write'], ['write', 'output'], ['output', 'check']),
    },
];
