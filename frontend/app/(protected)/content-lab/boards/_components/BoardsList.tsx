'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, CalendarClock, ChevronRight, Loader2, Pencil, SearchIcon, Trash2, Workflow } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contentLabBoardRoute } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { ContentLabBoardSummary } from '@/app/actions/content-lab-actions';
import { CONTENT_LAB_BOARD_TEMPLATES, type ContentLabBoardTemplate } from '../../_constants';
import type { UseBoardsPageReturn } from '../_hooks/use-boards-page';
import { describeSchedule } from '../_utils/schedule';
import { HowBoardsWork } from './HowBoardsWork';
import { TemplatePipeline } from './NodeRole';

const templateOf = (templateId: string | null) => CONTENT_LAB_BOARD_TEMPLATES.find((template) => template.id === templateId) ?? null;

/** Past this many boards, a box to find one by name. */
const FIND_FROM = 6;

/** A template as a card: its board drawn small on a dotted canvas, then what you give it and what you get. The whole card starts it. */
function TemplateCard({ template }: { template: ContentLabBoardTemplate }) {
    const { creatingTemplateId, createBoard } = usePage<UseBoardsPageReturn>();
    const creating = creatingTemplateId === template.id;
    return (
        <li data-testid={`template-${template.id}`}>
            <button
                type="button"
                disabled={!!creatingTemplateId}
                onClick={() => createBoard(template.id)}
                aria-label={`Use template ${template.title}`}
                className="group bg-card hover:border-primary/50 focus-visible:ring-ring/50 flex h-full w-full flex-col overflow-hidden rounded-xl border text-left shadow-xs transition-[border-color,box-shadow] outline-none hover:shadow-md focus-visible:ring-[3px] disabled:cursor-wait disabled:opacity-70"
            >
                <span className="bg-muted/50 grid h-24 place-items-center border-b bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:14px_14px] px-3">
                    <TemplatePipeline nodes={template.nodes} />
                </span>
                <span className="flex flex-1 flex-col gap-3 p-4">
                    <span className="flex flex-col gap-1">
                        <span className="font-semibold">{template.title}</span>
                        <span className="text-muted-foreground text-sm">{template.description}</span>
                    </span>
                    <span className="mt-auto grid gap-1 text-xs">
                        <span className="flex gap-2">
                            <span className="text-muted-foreground w-14 shrink-0">You give</span>
                            <span className="font-medium">{template.takes}</span>
                        </span>
                        <span className="flex gap-2">
                            <span className="text-muted-foreground w-14 shrink-0">You get</span>
                            <span className="font-medium">{template.gives}</span>
                        </span>
                    </span>
                    <span className="text-primary flex items-center gap-1.5 text-sm font-semibold">
                        {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                        {creating ? 'Setting it up…' : 'Use template'}
                        {creating ? null : <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
                    </span>
                </span>
            </button>
        </li>
    );
}

/** One saved board as a row: its shape, name, what it is and when it was edited, schedule; rename and delete at the end. */
function BoardRow({ board }: { board: ContentLabBoardSummary }) {
    const page = usePage<UseBoardsPageReturn>();
    const template = templateOf(board.templateId);
    const scheduled = board.schedule && board.schedule.repeat !== 'off';
    return (
        <li className="group/row hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3 transition-colors" data-testid="board-card">
            <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                <Workflow className="size-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link
                    href={contentLabBoardRoute(board._id!)}
                    className="truncate font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:outline-none"
                >
                    {board.title}
                </Link>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span>{template?.title ?? 'Blank board'}</span>
                    <span aria-hidden>·</span>
                    <span>{board.nodeCount} boxes</span>
                    <span aria-hidden>·</span>
                    <span>edited {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}</span>
                    {scheduled ? (
                        <span
                            className={cn(
                                'flex items-center gap-1 font-medium',
                                board.schedule!.paused ? 'text-muted-foreground' : 'text-emerald-700 dark:text-emerald-400',
                            )}
                            data-testid="board-schedule"
                        >
                            <CalendarClock className="size-3.5" aria-hidden />
                            {board.schedule!.paused ? 'Schedule paused' : `Scheduled: ${describeSchedule(board.schedule!)}`}
                        </span>
                    ) : null}
                </span>
            </span>
            {/* Above the row's link, so they don't open the board. */}
            <span className="relative z-10 flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-within:opacity-100">
                <Button size="icon" variant="ghost" className="size-8" onClick={() => page.openRename(board)} aria-label={`Rename ${board.title}`} title="Rename">
                    <Pencil />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive size-8"
                    onClick={() => page.setDeleting(board)}
                    aria-label={`Delete ${board.title}`}
                    title="Delete"
                >
                    <Trash2 />
                </Button>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </li>
    );
}

export function BoardsList() {
    const page = usePage<UseBoardsPageReturn>();
    const { boards } = page;
    const [find, setFind] = useState('');
    const shown = find.trim() ? boards.filter((board) => board.title.toLowerCase().includes(find.trim().toLowerCase())) : boards;

    return (
        <div className="flex w-full flex-col gap-10 p-1 sm:p-2">
            <HowBoardsWork />

            <section className="flex flex-col gap-4" aria-labelledby="new-board-title">
                <div>
                    <h2 id="new-board-title" className="text-lg font-semibold">
                        Start from a template
                    </h2>
                    <p className="text-muted-foreground text-sm">Each one opens already wired. Fill in the topic or link, save, then run it.</p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                    {CONTENT_LAB_BOARD_TEMPLATES.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="your-boards-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="your-boards-title" className="flex items-center gap-2 text-lg font-semibold">
                        Your boards
                        {boards.length ? (
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">{boards.length}</span>
                        ) : null}
                    </h2>
                    {boards.length > FIND_FROM ? (
                        <div className="relative w-full sm:w-64">
                            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
                            <Input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a board" aria-label="Find a board" className="pl-8" />
                        </div>
                    ) : null}
                </div>
                {boards.length === 0 ? (
                    <EmptyState
                        icon={<Workflow />}
                        title="No boards yet"
                        description="Start one from a template above. Save your edits with the Save button or Ctrl+S."
                    />
                ) : shown.length === 0 ? (
                    <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">No board is called “{find.trim()}”.</p>
                ) : (
                    <ul className="bg-card divide-y overflow-hidden rounded-xl border" aria-label="Your boards">
                        {shown.map((board) => (
                            <BoardRow key={board._id} board={board} />
                        ))}
                    </ul>
                )}
            </section>

            <Dialog open={!!page.renaming} onOpenChange={(open) => !open && !page.busy && page.closeRename()}>
                <DialogContent>
                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void page.submitRename();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Rename board</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-2">
                            <Label htmlFor="board-title">Name</Label>
                            <Input
                                id="board-title"
                                value={page.renameValue}
                                maxLength={120}
                                onChange={(event) => page.setRenameValue(event.target.value)}
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={page.closeRename} disabled={page.busy}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={page.busy || !page.renameValue.trim()}>
                                Save
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!page.deleting}
                onOpenChange={(open) => !open && !page.busy && page.setDeleting(null)}
                title="Delete board?"
                alertMessage={`“${page.deleting?.title ?? ''}” and everything on it will be deleted. This cannot be undone.`}
                confirmText="Delete board"
                onConfirm={() => void page.confirmDelete()}
                isLoading={page.busy}
            />
        </div>
    );
}
