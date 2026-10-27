import type { ContentLabBoardEdge, ContentLabNodeKind } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_NODE_META } from '../../../_constants';

type Wire = Pick<ContentLabBoardEdge, 'source' | 'target'>;

/**
 * Kahn's algorithm in levels: every node runs after everything wired into it. Nodes on a cycle are
 * left out (connecting refuses cycles, so only hand-edited data has one).
 */
export function topoLevels(ids: string[], edges: Wire[]): string[][] {
    const known = new Set(ids);
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const { source, target } of edges) {
        if (known.has(source) && known.has(target)) indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
    const levels: string[][] = [];
    let current = ids.filter((id) => indegree.get(id) === 0);
    while (current.length) {
        levels.push(current);
        const next: string[] = [];
        for (const id of current) {
            for (const { source, target } of edges) {
                if (source !== id || !known.has(target)) continue;
                const left = (indegree.get(target) ?? 0) - 1;
                indegree.set(target, left);
                if (left === 0) next.push(target);
            }
        }
        current = next;
    }
    return levels;
}

/** True when wiring `source → target` would close a loop (target already reaches source). */
export function wouldCycle(edges: Wire[], source: string, target: string): boolean {
    if (source === target) return true;
    const stack = [target];
    const seen = new Set<string>();
    while (stack.length) {
        const id = stack.pop()!;
        if (id === source) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const edge of edges) if (edge.source === id) stack.push(edge.target);
    }
    return false;
}

/** Mobile Flow view order: inputs → Hooks → Write → Outputs → Check, then wiring order, then top to bottom. */
export function flowOrder<T extends { id: string; kind: ContentLabNodeKind; y: number }>(nodes: T[], edges: Wire[]): T[] {
    const level = new Map<string, number>();
    topoLevels(
        nodes.map((node) => node.id),
        edges,
    ).forEach((ids, index) => ids.forEach((id) => level.set(id, index)));
    const rank = (node: T) => [CONTENT_LAB_NODE_META[node.kind].stage, level.get(node.id) ?? Number.MAX_SAFE_INTEGER, node.y];
    return [...nodes].sort((a, b) => {
        const [ra, rb] = [rank(a), rank(b)];
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
}
