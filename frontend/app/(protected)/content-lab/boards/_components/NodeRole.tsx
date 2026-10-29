import {
    ArrowRight,
    Eye,
    FileText,
    Link2,
    Megaphone,
    PenLine,
    ShieldCheck,
    Signature,
    Sparkles,
    StickyNote,
    TrendingUp,
    UserRound,
    type LucideIcon,
} from 'lucide-react';
import { ContentLabNodeKind, type ContentLabBoardNode } from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import {
    CONTENT_LAB_NODE_META,
    CONTENT_LAB_NODE_ROLE_ORDER,
    CONTENT_LAB_NODE_ROLES,
    nodeRole,
    type ContentLabNodeRole,
} from '../../_constants';

export const NODE_ICON: Record<ContentLabNodeKind, LucideIcon> = {
    [ContentLabNodeKind.VOICE]: Signature,
    [ContentLabNodeKind.WORKING]: TrendingUp,
    [ContentLabNodeKind.CREATOR]: UserRound,
    [ContentLabNodeKind.WATCHING]: Eye,
    [ContentLabNodeKind.POST]: Link2,
    [ContentLabNodeKind.ADS]: Megaphone,
    [ContentLabNodeKind.NOTE]: StickyNote,
    [ContentLabNodeKind.HOOKS]: Sparkles,
    [ContentLabNodeKind.WRITE]: PenLine,
    [ContentLabNodeKind.OUTPUT]: FileText,
    [ContentLabNodeKind.CHECK]: ShieldCheck,
};

/** One colour per role, used on the box's top edge, its icon, its handles and the minimap. */
export const ROLE_STYLE: Record<ContentLabNodeRole, { edge: string; side: string; chip: string; handle: string; hex: string }> = {
    input: {
        edge: 'border-t-sky-500',
        side: 'border-l-sky-500',
        chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
        handle: '!bg-sky-500',
        hex: '#0ea5e9',
    },
    step: {
        edge: 'border-t-violet-500',
        side: 'border-l-violet-500',
        chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
        handle: '!bg-violet-500',
        hex: '#8b5cf6',
    },
    output: {
        edge: 'border-t-emerald-500',
        side: 'border-l-emerald-500',
        chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        handle: '!bg-emerald-500',
        hex: '#10b981',
    },
};

/** The box's icon in its role colour. */
export function NodeIcon({ kind, className }: { kind: ContentLabNodeKind; className?: string }) {
    const Icon = NODE_ICON[kind];
    return (
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', ROLE_STYLE[nodeRole(kind)].chip, className)}>
            <Icon className="size-4" aria-hidden />
        </span>
    );
}

/** Inputs → Steps → Outputs, each in its colour with what it means. `detailed` also lists the boxes in each. */
export function BoardLegend({ detailed, className }: { detailed?: boolean; className?: string }) {
    const kinds = Object.values(ContentLabNodeKind);
    return (
        <ol className={cn('grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]', !detailed && 'grid-cols-3', className)} aria-label="How a board flows">
            {CONTENT_LAB_NODE_ROLE_ORDER.map((role, index) => (
                <li key={role} className="contents">
                    {index > 0 ? <ArrowRight className="text-muted-foreground hidden size-4 self-center md:block" aria-hidden /> : null}
                    <div className={cn('bg-card flex min-w-0 flex-col gap-1.5 rounded-lg border border-l-4 px-3 py-2', ROLE_STYLE[role].side)}>
                        <p className="text-sm font-semibold">
                            {index + 1} · {CONTENT_LAB_NODE_ROLES[role].plural}
                        </p>
                        <p className={cn('text-muted-foreground text-xs', !detailed && 'hidden md:block')}>{CONTENT_LAB_NODE_ROLES[role].hint}</p>
                        {detailed ? (
                            <ul className="flex flex-wrap gap-1.5 pt-1">
                                {kinds
                                    .filter((kind) => nodeRole(kind) === role)
                                    .map((kind) => (
                                        <li key={kind} className="flex items-center gap-1 text-xs">
                                            <NodeIcon kind={kind} className="size-5 [&_svg]:size-3" />
                                            {CONTENT_LAB_NODE_META[kind].label}
                                        </li>
                                    ))}
                            </ul>
                        ) : null}
                    </div>
                </li>
            ))}
        </ol>
    );
}

/** A template's boxes as icons, grouped Inputs → Steps → Outputs, so the card shows its shape at a glance. */
export function TemplatePipeline({ nodes }: { nodes: ContentLabBoardNode[] }) {
    const groups = CONTENT_LAB_NODE_ROLE_ORDER.map((role) => [...new Set(nodes.map((n) => n.kind).filter((kind) => nodeRole(kind) === role))]);
    return (
        <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
            {groups.map((kinds, index) => (
                <span key={CONTENT_LAB_NODE_ROLE_ORDER[index]} className="flex items-center gap-1.5">
                    {index > 0 ? <ArrowRight className="text-muted-foreground size-3.5" /> : null}
                    <span className="flex gap-1">
                        {kinds.map((kind) => (
                            <NodeIcon key={kind} kind={kind} />
                        ))}
                    </span>
                </span>
            ))}
        </div>
    );
}
