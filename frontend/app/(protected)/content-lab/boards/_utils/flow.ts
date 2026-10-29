import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { ContentLabNodeKind, type ContentLabBoardEdge, type ContentLabNodeData, type ContentLabProfile } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_FORMAT_LABELS, CONTENT_LAB_NODE_META, CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import { topoLevels } from './graph';

/**
 * How data moves through a board, in plain words: node names, what travels along each wire,
 * and the numbered "How this board runs" steps. Shared by the canvas, the Flow view and the sheet.
 */

type Wire = Pick<ContentLabBoardEdge, 'source' | 'target'>;
type FlowNode = { id: string; kind: ContentLabNodeKind; data: ContentLabNodeData };

/** "Output · Reel", "What's working", … */
export function nodeLabel(kind: ContentLabNodeKind, settings: ContentLabNodeData): string {
    const base = CONTENT_LAB_NODE_META[kind].label;
    return kind === ContentLabNodeKind.OUTPUT && settings.format ? `${base} · ${CONTENT_LAB_FORMAT_LABELS[settings.format]}` : base;
}

/** What travels along a wire leaving `kind`: counted after a run ("12 top posts"), else in general ("top posts"). */
export function wireLabel(kind: ContentLabNodeKind, sent?: string): string | null {
    return sent ?? CONTENT_LAB_NODE_META[kind].sends;
}

/** "1 top post" / "12 top posts". */
export const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const quoted = (text?: string) => (text?.trim() ? `“${text.trim()}”` : null);

/** The accounts the "Your tone" node reads: "@me on YouTube". */
export function toneAccounts(profile: Pick<ContentLabProfile, 'handles'>): { platform: ContentLabPlatform; handle: string }[] {
    return (Object.entries(profile.handles) as [ContentLabPlatform, string | undefined][])
        .filter((entry): entry is [ContentLabPlatform, string] => !!entry[1])
        .map(([platform, handle]) => ({ platform, handle }));
}

function sentence(node: FlowNode, incoming: FlowNode[], profile: Pick<ContentLabProfile, 'handles'>): string {
    const label = nodeLabel(node.kind, node.data);
    const from = list(incoming.map((source) => nodeLabel(source.kind, source.data)));
    const { data } = node;
    switch (node.kind) {
        case ContentLabNodeKind.VOICE: {
            const accounts = toneAccounts(profile).map(({ platform, handle }) => `@${handle} on ${CONTENT_LAB_PLATFORM_LABELS[platform]}`);
            return accounts.length
                ? `${label} reads your recent posts (${list(accounts)}) to learn how you write.`
                : `${label} has no accounts to read yet, so drafts use a plain tone. Connect yours in Settings.`;
        }
        case ContentLabNodeKind.WORKING: {
            const platforms = list((data.platforms ?? []).map((platform) => CONTENT_LAB_PLATFORM_LABELS[platform]));
            return `${label} finds the top posts for ${quoted(data.query) ?? 'your topic (type one first)'}${platforms ? ` on ${platforms}` : ''}.`;
        }
        case ContentLabNodeKind.CREATOR:
            return data.handle?.trim()
                ? `${label} pulls the best posts of @${data.handle.trim().replace(/^@+/, '')} on ${CONTENT_LAB_PLATFORM_LABELS[data.platform ?? 'youtube']}.`
                : `${label} pulls one creator's best posts (type a handle first).`;
        case ContentLabNodeKind.WATCHING:
            return `${label} brings in standout posts from the creators you watch.`;
        case ContentLabNodeKind.POST:
            return data.url?.trim()
                ? `${label} breaks down the post you linked: its hook, structure and call to action.`
                : `${label} breaks down one post (paste a link first).`;
        case ContentLabNodeKind.ADS:
            return `${label} finds ads running for ${quoted(data.query) ?? 'a topic (type one first)'}.`;
        case ContentLabNodeKind.NOTE:
            return data.text?.trim() ? `${label} adds your angle.` : `${label} is empty: type your angle, or leave it out.`;
        case ContentLabNodeKind.HOOKS:
            return incoming.length
                ? `${label} reads the posts from ${from} and finds the hooks, structure and calls to action they share.`
                : `${label} has nothing plugged in yet. ${CONTENT_LAB_NODE_META[node.kind].needs}.`;
        case ContentLabNodeKind.WRITE:
            return incoming.length
                ? `${label} puts ${list(incoming.map((source) => `${wireLabel(source.kind)} from ${nodeLabel(source.kind, source.data)}`))} into one brief.`
                : `${label} has nothing plugged in, so it writes from the topic only.`;
        case ContentLabNodeKind.OUTPUT:
            if (incoming.some((source) => source.kind === ContentLabNodeKind.WRITE)) {
                return `${label} writes the ${data.format ? CONTENT_LAB_FORMAT_LABELS[data.format] : 'draft'} from that brief on your AI key.`;
            }
            return data.text?.trim() ? `${label} holds the draft you typed.` : `${label} is not plugged into Write yet, so nothing writes it.`;
        case ContentLabNodeKind.CHECK:
            return incoming.length
                ? `${label} scores the draft from ${from} against the top posts on its platform.`
                : `${label} has no draft to score yet. Plug in an Output.`;
    }
}

export type BoardStep = { text: string; nodeIds: string[] };

/**
 * "How this board runs", numbered: one step per wave of nodes that run together (inputs first,
 * then each node once everything wired into it is done), then what you do with the drafts.
 */
export function boardSteps(nodes: FlowNode[], edges: Wire[], profile: Pick<ContentLabProfile, 'handles'>): BoardStep[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = (id: string) => edges.filter((edge) => edge.target === id && byId.has(edge.source)).map((edge) => byId.get(edge.source)!);
    const steps: BoardStep[] = topoLevels(
        nodes.map((node) => node.id),
        edges,
    ).map((ids) => ({
        nodeIds: ids,
        text: ids.map((id) => sentence(byId.get(id)!, incoming(id), profile)).join(' '),
    }));
    if (nodes.some((node) => node.kind === ContentLabNodeKind.OUTPUT)) {
        steps.push({ nodeIds: [], text: 'You read the drafts, edit them if you like, and copy them to post.' });
    }
    return steps;
}
