'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_NODE_META } from '../../../_constants';
import type { UseBoardPageReturn } from '../_hooks/use-board-page';

/** "Connect to…": tick the nodes this one feeds. Nodes that would make a loop, or take no input, are not offered. */
export function ConnectSheet() {
    const page = usePage<UseBoardPageReturn>();
    const nodeId = page.connecting;
    const source = page.ordered.find((node) => node.id === nodeId);
    const view = nodeId ? page.nodeViews[nodeId] : undefined;
    const targets = source ? page.ordered.filter((node) => node.id !== source.id && page.canConnect(source.id, node.id)) : [];
    const feeds = new Set(page.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target));

    return (
        <Sheet open={!!source} onOpenChange={(open) => !open && page.setConnecting(null)}>
            <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Connect {view?.label ?? ''} to…</SheetTitle>
                    <SheetDescription>
                        {view?.sends ? `It sends ${view.sends} to every node you tick.` : 'What this node finds goes into every node you tick.'}
                    </SheetDescription>
                </SheetHeader>
                <ul className="grid gap-1 px-4 pb-6">
                    {targets.length === 0 ? <li className="text-muted-foreground text-sm">No node can take this one’s output.</li> : null}
                    {targets.map((target) => {
                        const id = `connect-${target.id}`;
                        const checked = feeds.has(target.id);
                        const label = page.nodeViews[target.id]?.label ?? '';
                        return (
                            <li key={target.id}>
                                <label htmlFor={id} className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2">
                                    <Checkbox
                                        id={id}
                                        checked={checked}
                                        onCheckedChange={() => (checked ? page.disconnect(source!.id, target.id) : page.connect(source!.id, target.id))}
                                    />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="text-sm">{label}</span>
                                        <span className="text-muted-foreground truncate text-xs">{CONTENT_LAB_NODE_META[target.data.kind].hint}</span>
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            </SheetContent>
        </Sheet>
    );
}
