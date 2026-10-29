'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ListOrdered } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePage } from '@/contexts/PageStore';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
import { cn } from '@/lib/utils';
import { NodeIcon } from '../../_components/NodeRole';
import { boardSteps } from '../../_utils/flow';
import type { UseBoardPageReturn } from '../_hooks/use-board-page';

const COLLAPSED_KEY = generateLocalStorageKey('content-lab', 'board-how-it-runs-collapsed');

/**
 * "How this board runs": the actual board in numbered plain-English steps (what each node does with
 * what is wired into it). Open until the viewer closes it once; then it stays closed for them.
 */
export function BoardHowItRuns({ className }: { className?: string }) {
    const page = usePage<UseBoardPageReturn>();
    const [open, setOpen] = useState(true);

    useEffect(() => {
        try {
            if (window.localStorage.getItem(COLLAPSED_KEY) === '1') setOpen(false);
        } catch {
            // Storage blocked: stay open.
        }
    }, []);

    const toggle = (next: boolean) => {
        setOpen(next);
        try {
            if (next) window.localStorage.removeItem(COLLAPSED_KEY);
            else window.localStorage.setItem(COLLAPSED_KEY, '1');
        } catch {
            // Storage blocked: only this visit remembers.
        }
    };

    const steps = useMemo(
        () =>
            boardSteps(
                page.nodes.map((node) => ({ id: node.id, kind: node.data.kind, data: node.data.settings })),
                page.edges,
                page.profile,
            ),
        [page.nodes, page.edges, page.profile],
    );
    const kindOf = new Map(page.nodes.map((node) => [node.id, node.data.kind]));

    return (
        <Collapsible open={open} onOpenChange={toggle} className={cn('bg-card rounded-lg border', className)} data-testid="how-it-runs">
            <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold">
                <ListOrdered className="text-muted-foreground size-4" aria-hidden />
                <span className="flex-1">How this board runs</span>
                <span className="text-muted-foreground hidden text-xs font-normal sm:inline">{open ? 'Hide' : 'Show the steps'}</span>
                <ChevronDown className={cn('text-muted-foreground size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
                {steps.length ? (
                    <ol className="grid gap-2 px-3 pb-3">
                        {steps.map((step, index) => (
                            <li key={index} className="flex gap-2.5 text-sm">
                                <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
                                    {index + 1}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    {step.nodeIds.length ? (
                                        <span className="flex flex-wrap gap-1" aria-hidden>
                                            {[...new Set(step.nodeIds.map((id) => kindOf.get(id)!))].map((kind) => (
                                                <NodeIcon key={kind} kind={kind} className="size-5 [&_svg]:size-3" />
                                            ))}
                                        </span>
                                    ) : null}
                                    <span>{step.text}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-muted-foreground px-3 pb-3 text-sm">This board is empty. Add a node to start.</p>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
