'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { CalendarClock, Loader2, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contentLabBoardRoute } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_BOARD_TEMPLATES } from '../../_constants';
import type { UseBoardsPageReturn } from '../_hooks/use-boards-page';
import { describeSchedule } from '../_utils/schedule';
import { BoardLegend, TemplatePipeline } from './NodeRole';

const templateTitle = (templateId: string | null) =>
    CONTENT_LAB_BOARD_TEMPLATES.find((template) => template.id === templateId)?.title ?? 'Blank board';

export function BoardsList() {
    const page = usePage<UseBoardsPageReturn>();
    const { boards, creatingTemplateId } = page;

    return (
        <div className="flex w-full flex-col gap-8 p-1 sm:p-2">
            <section className="flex flex-col gap-3" aria-labelledby="how-boards-work">
                <div>
                    <h2 id="how-boards-work" className="text-lg font-semibold">
                        How a board works
                    </h2>
                    <p className="text-muted-foreground max-w-prose text-sm">
                        A board is a recipe for one piece of content. Nodes on the left bring ideas in (top posts, a creator, your tone),
                        the middle ones find what works and build a brief, and the ones on the right are the drafts you post. Each wire
                        carries what one node found to the next, and says so: “12 top posts”, “hooks”, “your tone”. Press Run board and
                        it all fills in, or schedule it to run by itself.
                    </p>
                </div>
                <BoardLegend detailed />
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="new-board-title">
                <div>
                    <h2 id="new-board-title" className="text-lg font-semibold">
                        New board
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Pick a template: it comes already wired. Fill in the topic or link, save, then run it. Drafts are written on your own AI key.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                    {CONTENT_LAB_BOARD_TEMPLATES.map((template) => (
                        <Card key={template.id} className="h-full gap-3 py-4" data-testid={`template-${template.id}`}>
                            <CardHeader className="gap-2 px-4">
                                <TemplatePipeline nodes={template.nodes} />
                                <CardTitle className="text-base">{template.title}</CardTitle>
                                <CardDescription>{template.description}</CardDescription>
                            </CardHeader>
                            <CardFooter className="mt-auto px-4">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!creatingTemplateId}
                                    onClick={() => page.createBoard(template.id)}
                                    aria-label={`Use template ${template.title}`}
                                >
                                    {creatingTemplateId === template.id ? <Loader2 className="animate-spin" /> : <Plus />}
                                    Use template
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="your-boards-title">
                <h2 id="your-boards-title" className="text-lg font-semibold">
                    Your boards
                </h2>
                {boards.length === 0 ? (
                    <EmptyState
                        icon={<Workflow />}
                        title="No boards yet"
                        description="Start one from a template above. Save your edits with the Save button or Ctrl+S."
                    />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Your boards">
                        {boards.map((board) => (
                            <li key={board._id}>
                                <Card className="h-full gap-2 py-4" data-testid="board-card">
                                    <CardHeader className="px-4">
                                        <CardTitle className="min-w-0 text-base">
                                            <Link
                                                href={contentLabBoardRoute(board._id!)}
                                                className="hover:text-primary block truncate underline-offset-4 hover:underline"
                                            >
                                                {board.title}
                                            </Link>
                                        </CardTitle>
                                        <CardDescription>
                                            {templateTitle(board.templateId)} · {board.nodeCount} nodes · edited{' '}
                                            {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
                                            {board.schedule && board.schedule.repeat !== 'off' ? (
                                                <span className="mt-1 flex items-center gap-1" data-testid="board-schedule">
                                                    <CalendarClock className="size-3.5" aria-hidden />
                                                    {board.schedule.paused ? 'Schedule paused' : `Scheduled: ${describeSchedule(board.schedule)}`}
                                                </span>
                                            ) : null}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter className="gap-2 px-4">
                                        <Button size="sm" variant="ghost" onClick={() => page.openRename(board)} aria-label={`Rename ${board.title}`}>
                                            <Pencil /> Rename
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive"
                                            onClick={() => page.setDeleting(board)}
                                            aria-label={`Delete ${board.title}`}
                                        >
                                            <Trash2 /> Delete
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </li>
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
