'use client';

import '@xyflow/react/dist/style.css';

import { useTheme } from 'next-themes';
import { Link2, X } from 'lucide-react';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type NodeProps } from '@xyflow/react';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLES, nodeRole } from '../../../_constants';
import { NodeIcon, ROLE_STYLE } from '../../_components/NodeRole';
import { nodeLabel, type BoardFlowNode, type UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardNodeBody, NodeStatusIcon, NodeTagBadge } from './BoardNodeBody';

const HANDLE_CLASS = '!size-3.5 !border-2 !border-background';

function BoardCanvasNode({ id, data, selected }: NodeProps<BoardFlowNode>) {
    const page = usePage<UseBoardPageReturn>();
    const meta = CONTENT_LAB_NODE_META[data.kind];
    const role = nodeRole(data.kind);
    const run = page.runs[id];
    const label = nodeLabel(data.kind, data.settings);

    return (
        <div
            data-testid="board-node"
            data-node-id={id}
            data-kind={data.kind}
            data-role={role}
            data-status={run?.status ?? 'idle'}
            className={cn(
                'bg-card text-card-foreground w-64 rounded-xl border border-t-4 shadow-sm',
                ROLE_STYLE[role].edge,
                selected && 'ring-primary ring-2',
            )}
        >
            {meta.acceptsInput ? (
                <Handle type="target" position={Position.Left} className={cn(HANDLE_CLASS, ROLE_STYLE[role].handle)} title="Wire in" />
            ) : null}
            <header className="board-node-drag flex cursor-grab items-center gap-2 border-b py-1.5 pr-1.5 pl-2 active:cursor-grabbing">
                <NodeIcon kind={data.kind} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-muted-foreground text-[10px] leading-none font-medium tracking-wider uppercase">
                        {CONTENT_LAB_NODE_ROLES[role].label}
                    </span>
                    <span className="truncate text-sm font-semibold">{label}</span>
                </span>
                <NodeStatusIcon run={run} />
                <NodeTagBadge kind={data.kind} />
                {meta.givesOutput ? (
                    <button
                        type="button"
                        className="nodrag text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                        aria-label={`Connect ${label} to…`}
                        onClick={() => page.setConnecting(id)}
                    >
                        <Link2 className="size-3.5" />
                    </button>
                ) : null}
                <button
                    type="button"
                    className="nodrag text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                    aria-label={`Delete ${label}`}
                    onClick={() => page.removeNode(id)}
                >
                    <X className="size-3.5" />
                </button>
            </header>
            <div className="p-3">
                <BoardNodeBody id={id} />
            </div>
            {meta.givesOutput ? (
                <Handle type="source" position={Position.Right} className={cn(HANDLE_CLASS, ROLE_STYLE[role].handle)} title="Drag to wire out" />
            ) : null}
        </div>
    );
}

const NODE_TYPES = { board: BoardCanvasNode };

/** The real canvas: drag boxes by their title, wire right handle → left handle, pinch or scroll to zoom. */
export function BoardCanvas({ className }: { className?: string }) {
    const page = usePage<UseBoardPageReturn>();
    const { resolvedTheme } = useTheme();
    // A wire takes the colour of the box it leaves.
    const wireColor = new Map(page.nodes.map((node) => [node.id, ROLE_STYLE[nodeRole(node.data.kind)].hex]));

    return (
        <div className={cn('bg-muted/30 overflow-hidden rounded-xl border', className)} data-testid="board-canvas">
            <ReactFlow<BoardFlowNode>
                nodes={page.nodes}
                edges={page.edges.map((edge) => ({ ...edge, animated: page.running, style: { stroke: wireColor.get(edge.source), strokeWidth: 2 } }))}
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
                <MiniMap pannable zoomable nodeColor={(node: BoardFlowNode) => ROLE_STYLE[nodeRole(node.data.kind)].hex} className="!hidden lg:!block" />
            </ReactFlow>
        </div>
    );
}
