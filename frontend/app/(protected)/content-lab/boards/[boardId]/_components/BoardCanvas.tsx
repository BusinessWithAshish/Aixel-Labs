'use client';

import '@xyflow/react/dist/style.css';

import { memo, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Link2, Plug, X } from 'lucide-react';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { ContentLabProfile } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLES, nodeRole } from '../../../_constants';
import { NodeIcon, ROLE_STYLE } from '../../_components/NodeRole';
import type { BoardFlowNode, BoardNodeActions, NodeView, UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardNodeBody, NodeStatusIcon, NodeTagBadge, NodeWiring } from './BoardNodeBody';

const HANDLE_CLASS = '!size-3.5 !border-2 !border-background';

type CanvasNodeData = BoardFlowNode['data'] & { view: NodeView; actions: BoardNodeActions; profile: ContentLabProfile };
type CanvasNode = Node<CanvasNodeData, 'board'>;

/** One node on the canvas. Everything it shows comes in through its own `data`, so it re-renders only when that changes. */
const BoardCanvasNode = memo(function BoardCanvasNode({ id, data, selected }: NodeProps<CanvasNode>) {
    const { kind, settings, view, actions, profile } = data;
    const meta = CONTENT_LAB_NODE_META[kind];
    const role = nodeRole(kind);
    const unwired = meta.acceptsInput && !view.gets.length;

    return (
        <div
            data-testid="board-node"
            data-node-id={id}
            data-kind={kind}
            data-role={role}
            data-status={view.run?.status ?? 'idle'}
            className={cn(
                'bg-card text-card-foreground relative w-64 rounded-xl border border-t-4 shadow-sm',
                ROLE_STYLE[role].edge,
                selected && 'ring-primary ring-2',
            )}
        >
            {meta.acceptsInput ? (
                <Handle
                    type="target"
                    position={Position.Left}
                    className={cn(HANDLE_CLASS, ROLE_STYLE[role].handle, unwired && '!bg-background !border-dashed !border-amber-500 !size-4')}
                    title={unwired ? `Plug in here. ${meta.needs}` : 'Wires in'}
                />
            ) : null}
            {unwired ? (
                <span className="pointer-events-none absolute top-1/2 -left-1 flex -translate-x-full -translate-y-1/2 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-amber-800 dark:text-amber-200">
                    <Plug className="size-3" aria-hidden /> plug in
                </span>
            ) : null}
            <header className="board-node-drag flex cursor-grab items-center gap-2 border-b py-1.5 pr-1.5 pl-2 active:cursor-grabbing">
                <NodeIcon kind={kind} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-muted-foreground text-[10px] leading-none font-medium tracking-wider uppercase">
                        {CONTENT_LAB_NODE_ROLES[role].label}
                    </span>
                    <span className="truncate text-sm font-semibold">{view.label}</span>
                </span>
                <NodeStatusIcon run={view.run} />
                <NodeTagBadge kind={kind} />
                {meta.givesOutput ? (
                    <button
                        type="button"
                        className="nodrag text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                        aria-label={`Connect ${view.label} to…`}
                        onClick={() => actions.connectFrom(id)}
                    >
                        <Link2 className="size-3.5" />
                    </button>
                ) : null}
                <button
                    type="button"
                    className="nodrag text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                    aria-label={`Delete ${view.label}`}
                    onClick={() => actions.removeNode(id)}
                >
                    <X className="size-3.5" />
                </button>
            </header>
            <div className="grid gap-2.5 p-3">
                <NodeWiring view={view} />
                <BoardNodeBody id={id} kind={kind} settings={settings} run={view.run} profile={profile} actions={actions} />
            </div>
            {meta.givesOutput ? (
                <Handle
                    type="source"
                    position={Position.Right}
                    className={cn(HANDLE_CLASS, ROLE_STYLE[role].handle)}
                    title={view.sends ? `Drag to send ${view.sends} to another node` : 'Drag to wire out'}
                />
            ) : null}
        </div>
    );
});

const NODE_TYPES = { board: BoardCanvasNode };

/**
 * The real canvas: drag nodes by their title, wire right handle → left handle, pinch or scroll to
 * zoom. Each wire is labelled with what travels along it ("12 top posts" after a run).
 */
export function BoardCanvas({ className }: { className?: string }) {
    const page = usePage<UseBoardPageReturn>();
    const { resolvedTheme } = useTheme();
    const { nodeViews, actions, profile, running } = page;

    // A node object is rebuilt only when the node itself or its view changes, so React Flow re-renders just that one.
    const cache = useRef(new WeakMap<BoardFlowNode, { view: NodeView; node: CanvasNode }>());
    const nodes = useMemo(
        () =>
            page.nodes.flatMap((node) => {
                const view = nodeViews[node.id];
                if (!view) return [];
                const hit = cache.current.get(node);
                if (hit && hit.view === view) return [hit.node];
                const decorated: CanvasNode = { ...node, data: { ...node.data, view, actions, profile } };
                cache.current.set(node, { view, node: decorated });
                return [decorated];
            }),
        [page.nodes, nodeViews, actions, profile],
    );

    const edges = useMemo<Edge[]>(
        () =>
            page.edges.map((edge) => {
                const source = nodeViews[edge.source];
                const color = source ? ROLE_STYLE[nodeRole(source.kind)].hex : undefined;
                return {
                    ...edge,
                    animated: running,
                    label: source?.sends ?? undefined,
                    labelShowBg: true,
                    labelBgPadding: [6, 3] as [number, number],
                    labelBgBorderRadius: 999,
                    labelStyle: { fontSize: 11, fontWeight: 600, fill: color },
                    labelBgStyle: { fill: 'var(--card)', stroke: color, strokeWidth: 1 },
                    style: { stroke: color, strokeWidth: 2 },
                };
            }),
        [page.edges, nodeViews, running],
    );

    return (
        <div className={cn('bg-muted/30 overflow-hidden rounded-xl border', className)} data-testid="board-canvas">
            <ReactFlow<CanvasNode>
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={page.onNodesChange}
                onEdgesChange={page.onEdgesChange}
                onConnect={page.onConnect}
                isValidConnection={(connection) => page.canConnect(connection.source, connection.target)}
                colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
                deleteKeyCode={['Backspace', 'Delete']}
                minZoom={0.2}
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            >
                <Background gap={18} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(node: CanvasNode) => ROLE_STYLE[nodeRole(node.data.kind)].hex} className="!hidden lg:!block" />
            </ReactFlow>
        </div>
    );
}
