'use client';

import { Loader2, Play, Plus, Square } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { ContentLabNodeKind } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLE_ORDER, CONTENT_LAB_NODE_ROLES, nodeRole } from '../../../_constants';
import { BoardLegend, NodeIcon } from '../../_components/NodeRole';
import type { BoardSaveState, UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardCanvas } from './BoardCanvas';
import { BoardFlowView } from './BoardFlowView';
import { NodeTagBadge } from './BoardNodeBody';
import { ConnectSheet } from './ConnectSheet';

const SAVE_LABEL: Record<BoardSaveState, string> = {
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved',
};

/** Half a box, so a new one lands centred. */
const NODE_HALF_WIDTH = 128;

function BoardToolbar() {
    const page = usePage<UseBoardPageReturn>();
    const flow = useReactFlow();

    const add = (kind: ContentLabNodeKind) => {
        const position =
            page.view === 'canvas'
                ? flow.screenToFlowPosition({ x: window.innerWidth / 2 - NODE_HALF_WIDTH, y: window.innerHeight / 2 - 80 })
                : undefined;
        page.addNode(kind, position);
    };

    return (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Board">
            {page.running ? (
                <Button onClick={page.stop} variant="outline">
                    <Square /> Stop
                </Button>
            ) : (
                <Button onClick={() => void page.run()}>
                    <Play /> Run board
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                        <Plus /> Add box
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                    {CONTENT_LAB_NODE_ROLE_ORDER.map((role, index) => (
                        <DropdownMenuGroup key={role}>
                            {index > 0 ? <DropdownMenuSeparator /> : null}
                            <DropdownMenuLabel className="text-muted-foreground text-xs">{CONTENT_LAB_NODE_ROLES[role].plural}</DropdownMenuLabel>
                            {Object.values(ContentLabNodeKind)
                                .filter((kind) => nodeRole(kind) === role)
                                .map((kind) => (
                                    <DropdownMenuItem key={kind} onSelect={() => add(kind)} className="gap-2">
                                        <NodeIcon kind={kind} className="size-6" />
                                        <span className="flex-1">{CONTENT_LAB_NODE_META[kind].label}</span>
                                        <NodeTagBadge kind={kind} />
                                    </DropdownMenuItem>
                                ))}
                        </DropdownMenuGroup>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            <ToggleGroup
                type="single"
                variant="outline"
                value={page.view}
                onValueChange={(value) => value && page.setView(value as 'flow' | 'canvas')}
                aria-label="View"
            >
                <ToggleGroupItem value="flow" className="px-3">
                    Flow
                </ToggleGroupItem>
                <ToggleGroupItem value="canvas" className="px-3">
                    Canvas
                </ToggleGroupItem>
            </ToggleGroup>
            <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs" role="status" data-testid="save-state">
                {page.saveState === 'saving' ? <Loader2 className="size-3 animate-spin" /> : null}
                {SAVE_LABEL[page.saveState]}
            </span>
        </div>
    );
}

/** Toolbar, then the canvas (tablet/desktop default) or the Flow view (phone default). */
export function BoardView() {
    const page = usePage<UseBoardPageReturn>();

    return (
        <ReactFlowProvider>
            <div className="flex min-w-0 flex-col gap-3">
                <BoardToolbar />
                <BoardLegend />
                {page.view === 'canvas' ? (
                    <BoardCanvas className="h-[calc(100dvh-14rem)] min-h-[420px]" />
                ) : (
                    <BoardFlowView />
                )}
            </div>
            <ConnectSheet />
        </ReactFlowProvider>
    );
}
