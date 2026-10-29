'use client';

import { memo } from 'react';
import { ArrowDown, Link2, Trash2 } from 'lucide-react';
import type { ContentLabProfile } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLES, nodeRole } from '../../../_constants';
import { NodeIcon, ROLE_STYLE } from '../../_components/NodeRole';
import type { BoardFlowNode, BoardNodeActions, NodeView, UseBoardPageReturn } from '../_hooks/use-board-page';
import { BoardNodeBody, NodeStatusIcon, NodeTagBadge, NodeWiring } from './BoardNodeBody';

type FlowCardProps = { node: BoardFlowNode; view: NodeView; actions: BoardNodeActions; profile: ContentLabProfile };

/** One node as a card. Memoised: typing in one card does not re-render the others. */
const FlowCard = memo(function FlowCard({ node, view, actions, profile }: FlowCardProps) {
    const { kind, settings } = node.data;
    const role = nodeRole(kind);
    return (
        <Card
            className={cn('gap-3 border-l-4 py-3', ROLE_STYLE[role].side)}
            data-testid="flow-card"
            data-node-id={node.id}
            data-kind={kind}
            data-role={role}
            data-status={view.run?.status ?? 'idle'}
        >
            <CardHeader className="flex flex-row items-center gap-2 px-3">
                <NodeIcon kind={kind} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-muted-foreground text-[10px] leading-none font-medium tracking-wider uppercase">
                        {CONTENT_LAB_NODE_ROLES[role].label}
                    </span>
                    <h3 className="truncate text-sm font-semibold">{view.label}</h3>
                </span>
                <NodeStatusIcon run={view.run} />
                <NodeTagBadge kind={kind} />
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete ${view.label}`} onClick={() => actions.removeNode(node.id)}>
                    <Trash2 />
                </Button>
            </CardHeader>
            <CardContent className="grid gap-3 px-3">
                <NodeWiring view={view} />
                <BoardNodeBody id={node.id} kind={kind} settings={settings} run={view.run} profile={profile} actions={actions} />
                {CONTENT_LAB_NODE_META[kind].givesOutput ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {view.sendsTo.map((to) => (
                            <Badge key={to.id} variant="secondary" data-testid="feeds-chip">
                                feeds {to.label}
                            </Badge>
                        ))}
                        <Button size="sm" variant="outline" className="h-7" aria-label={`Connect ${view.label} to…`} onClick={() => actions.connectFrom(node.id)}>
                            <Link2 /> Connect to…
                        </Button>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
});

/**
 * Phones: the nodes as cards in wiring order (inputs → Hooks → Write → Outputs → Check), each saying
 * what it gets, what it sends and to where; wires are edited from the "Connect to…" sheet.
 */
export function BoardFlowView() {
    const page = usePage<UseBoardPageReturn>();

    return (
        <ol className="grid gap-2" aria-label="Board nodes in order">
            {page.ordered.map((node, index) => {
                const view = page.nodeViews[node.id];
                if (!view) return null;
                const previous = index > 0 ? page.ordered[index - 1] : null;
                const newStage = previous && CONTENT_LAB_NODE_META[previous.data.kind].stage !== CONTENT_LAB_NODE_META[node.data.kind].stage;
                return (
                    <li key={node.id} className="grid gap-2">
                        {newStage ? <ArrowDown className="text-muted-foreground mx-auto size-4" aria-hidden /> : null}
                        <FlowCard node={node} view={view} actions={page.actions} profile={page.profile} />
                    </li>
                );
            })}
        </ol>
    );
}
