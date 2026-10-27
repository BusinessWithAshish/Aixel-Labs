'use client';

import { Link2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_NODE_META } from '../../../_constants';
import { nodeLabel, type UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardNodeBody, NodeStatusIcon, NodeTagBadge } from './BoardNodeBody';

/**
 * Phones: the boxes as cards in wiring order (inputs → Hooks → Write → Outputs → Check), each saying
 * what it feeds; wires are edited from the "Connect to…" sheet.
 */
export function BoardFlowView() {
    const page = usePage<UseBoardPageReturn>();
    const labelOf = new Map(page.ordered.map((node) => [node.id, nodeLabel(node.kind, node.data)]));

    return (
        <ol className="grid gap-3" aria-label="Board boxes in order">
            {page.ordered.map((node) => {
                const label = labelOf.get(node.id)!;
                const run = page.runs[node.id];
                const feeds = page.edges.filter((edge) => edge.source === node.id);
                return (
                    <li key={node.id}>
                        <Card
                            className="gap-3 py-3"
                            data-testid="flow-card"
                            data-node-id={node.id}
                            data-kind={node.kind}
                            data-status={run?.status ?? 'idle'}
                        >
                            <CardHeader className="flex flex-row items-center gap-2 px-3">
                                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</h3>
                                <NodeStatusIcon run={run} />
                                <NodeTagBadge kind={node.kind} />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    aria-label={`Delete ${label}`}
                                    onClick={() => page.removeNode(node.id)}
                                >
                                    <Trash2 />
                                </Button>
                            </CardHeader>
                            <CardContent className="grid gap-3 px-3">
                                <BoardNodeBody id={node.id} />
                                {CONTENT_LAB_NODE_META[node.kind].givesOutput ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {feeds.map((edge) => (
                                            <Badge key={edge.id} variant="secondary" data-testid="feeds-chip">
                                                feeds {labelOf.get(edge.target)}
                                            </Badge>
                                        ))}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7"
                                            aria-label={`Connect ${label} to…`}
                                            onClick={() => page.setConnecting(node.id)}
                                        >
                                            <Link2 /> Connect to…
                                        </Button>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </li>
                );
            })}
        </ol>
    );
}
