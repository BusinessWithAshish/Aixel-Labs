'use client';

import { formatDistanceToNow } from 'date-fns';
import { CalendarClock, CloudOff, History, Loader2, Play, Plus, Rows3, Save, Square, Workflow } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { ContentLabNodeKind } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { cn } from '@/lib/utils';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLE_ORDER, CONTENT_LAB_NODE_ROLES, nodeRole } from '../../../_constants';
import { BoardLegend, NodeIcon } from '../../_components/NodeRole';
import { describeSchedule } from '../../_utils/schedule';
import type { BoardSaveState, UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardCanvas } from './BoardCanvas';
import { BoardFlowView } from './BoardFlowView';
import { BoardHowItRuns } from './BoardHowItRuns';
import { NodeTagBadge } from './BoardNodeBody';
import { ConnectSheet } from './ConnectSheet';
import { ScheduleSheet } from './ScheduleSheet';

const SAVE_LABEL: Record<BoardSaveState, string> = {
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved',
    offline: 'Offline: not saved',
    conflict: 'Not saved: board changed',
};

/** Half a node, so a new one lands centred. */
const NODE_HALF_WIDTH = 128;

function SaveControl() {
    const { saving } = usePage<UseBoardPageReturn>();
    const { saveState } = saving;
    return (
        <div className="ml-auto flex items-center gap-2">
            <span
                className={cn(
                    'flex items-center gap-1 text-xs',
                    saveState === 'saved'
                        ? 'text-muted-foreground'
                        : saveState === 'error' || saveState === 'conflict'
                          ? 'text-destructive'
                          : 'text-amber-700 dark:text-amber-300',
                )}
                role="status"
                data-testid="save-state"
            >
                {saveState === 'saving' ? <Loader2 className="size-3 animate-spin" /> : null}
                {saveState === 'offline' ? <CloudOff className="size-3" /> : null}
                {SAVE_LABEL[saveState]}
            </span>
            <Button
                variant={saveState === 'saved' ? 'outline' : 'default'}
                onClick={() => void saving.save()}
                disabled={saveState === 'saved' || saveState === 'saving' || saveState === 'offline' || saveState === 'conflict'}
                title="Save (Ctrl+S or ⌘S)"
                data-testid="save-board"
            >
                <Save /> {saveState === 'error' ? 'Retry save' : 'Save'}
            </Button>
        </div>
    );
}

function BoardToolbar() {
    const page = usePage<UseBoardPageReturn>();
    const flow = useReactFlow();
    const { schedule } = page;
    const scheduled = schedule.hasSchedule && schedule.schedule.repeat !== 'off';

    /** A new node lands in the middle of the canvas as it is on screen (the panels above push it below the window's middle). */
    const add = (kind: ContentLabNodeKind) => {
        const pane = page.view === 'canvas' ? document.querySelector('.react-flow')?.getBoundingClientRect() : null;
        const position = pane
            ? flow.screenToFlowPosition({ x: pane.left + pane.width / 2 - NODE_HALF_WIDTH, y: pane.top + Math.min(pane.height / 2, 260) - 80 })
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
                        <Plus /> Add node
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[min(20rem,calc(100vw-2rem))]">
                    {CONTENT_LAB_NODE_ROLE_ORDER.map((role, index) => (
                        <DropdownMenuGroup key={role}>
                            {index > 0 ? <DropdownMenuSeparator /> : null}
                            <DropdownMenuLabel className="text-muted-foreground text-xs">
                                {CONTENT_LAB_NODE_ROLES[role].plural}: {CONTENT_LAB_NODE_ROLES[role].hint.toLowerCase()}
                            </DropdownMenuLabel>
                            {Object.values(ContentLabNodeKind)
                                .filter((kind) => nodeRole(kind) === role)
                                .map((kind) => (
                                    <DropdownMenuItem key={kind} onSelect={() => add(kind)} className="items-start gap-2">
                                        <NodeIcon kind={kind} className="size-6" />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span>{CONTENT_LAB_NODE_META[kind].label}</span>
                                            <span className="text-muted-foreground text-xs">{CONTENT_LAB_NODE_META[kind].hint}</span>
                                        </span>
                                        <NodeTagBadge kind={kind} />
                                    </DropdownMenuItem>
                                ))}
                        </DropdownMenuGroup>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => schedule.setOpen(true)} data-testid="open-schedule">
                <CalendarClock />
                Schedule
                {scheduled ? (
                    <span className="text-muted-foreground hidden text-xs font-normal sm:inline">
                        · {schedule.schedule.paused ? 'Paused' : describeSchedule(schedule.schedule)}
                    </span>
                ) : null}
            </Button>
            <ToggleGroup
                type="single"
                spacing={1}
                value={page.view}
                onValueChange={(value) => value && page.setView(value as 'flow' | 'canvas')}
                className="bg-muted rounded-lg p-1"
                aria-label="View"
            >
                <ToggleGroupItem
                    value="flow"
                    className="data-[state=on]:bg-background h-7 gap-1.5 rounded-md px-2.5 data-[state=on]:shadow-sm"
                >
                    <Rows3 aria-hidden /> Flow
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="canvas"
                    className="data-[state=on]:bg-background h-7 gap-1.5 rounded-md px-2.5 data-[state=on]:shadow-sm"
                >
                    <Workflow aria-hidden /> Canvas
                </ToggleGroupItem>
            </ToggleGroup>
            <SaveControl />
        </div>
    );
}

/** Restore a local draft, offline, a failed save, results from a scheduled run. */
function BoardNotices() {
    const page = usePage<UseBoardPageReturn>();
    const { saving, shownRun } = page;
    const draft = saving.pendingDraft;

    return (
        <>
            {draft ? (
                <Alert data-testid="draft-notice">
                    <History />
                    <AlertTitle>You have unsaved edits on this device</AlertTitle>
                    <AlertDescription className="grid gap-2">
                        <p>
                            From {formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true })}, never saved.
                            {draft.boardChangedSince ? ' The board has changed since (for example by a scheduled run); restoring replaces that.' : ''}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={saving.restoreDraft}>
                                Restore my edits
                            </Button>
                            <Button size="sm" variant="outline" onClick={saving.discardDraft}>
                                Discard them
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            ) : null}
            {!saving.online ? (
                <Alert data-testid="offline-notice">
                    <CloudOff />
                    <AlertTitle>You are offline</AlertTitle>
                    <AlertDescription>Keep editing: your changes are kept on this device. Save once you are back online.</AlertDescription>
                </Alert>
            ) : null}
            {saving.conflict && saving.dirty ? (
                <Alert variant="destructive" data-testid="save-conflict">
                    <AlertTitle>The board changed since you opened it, so your edits were not saved</AlertTitle>
                    <AlertDescription className="grid gap-2">
                        <p>
                            Something else saved it {formatDistanceToNow(new Date(saving.conflict.updatedAt), { addSuffix: true })}: a
                            scheduled run writing new drafts, or this board open in another tab. Your edits are still here.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => void saving.resolveConflict('merge')}>
                                Keep my edits and add the new drafts
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void saving.resolveConflict('latest')}>
                                Load the latest board (drop my edits)
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void saving.resolveConflict('overwrite')}>
                                Save mine over it
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            ) : null}
            {saving.online && saving.saveState === 'error' ? (
                <Alert variant="destructive" data-testid="save-error">
                    <AlertTitle>The last save did not go through</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">{saving.saveError}. Your edits are still here.</span>
                        <Button size="sm" variant="outline" onClick={() => void saving.save()}>
                            Retry save
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : null}
            {shownRun && !page.running ? (
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs" data-testid="shown-run" suppressHydrationWarning>
                    Showing results from the scheduled run {formatDistanceToNow(new Date(shownRun.startedAt), { addSuffix: true })}.
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => page.schedule.setOpen(true)}>
                        See all runs
                    </button>
                </p>
            ) : null}
        </>
    );
}

/** Toolbar, notices, how the board runs, then the canvas (tablet/desktop default) or the Flow view (phone default). */
export function BoardView() {
    const page = usePage<UseBoardPageReturn>();

    return (
        <ReactFlowProvider>
            <div className="flex min-w-0 flex-col gap-3">
                <BoardToolbar />
                <BoardNotices />
                <BoardLegend />
                {page.view === 'canvas' ? (
                    // Wide screens: the steps sit beside the canvas, so the canvas keeps its full height.
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                        <BoardHowItRuns className="xl:order-2 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto" />
                        <BoardCanvas className="h-[calc(100dvh-14rem)] min-h-[420px] xl:order-1" />
                    </div>
                ) : (
                    <>
                        <BoardHowItRuns />
                        <BoardFlowView />
                    </>
                )}
            </div>
            <ConnectSheet />
            <ScheduleSheet />
        </ReactFlowProvider>
    );
}
