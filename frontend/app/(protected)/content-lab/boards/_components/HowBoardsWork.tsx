import { Fragment } from 'react';
import { ArrowDown, ArrowRight, CalendarClock, MousePointerClick, Play, type LucideIcon } from 'lucide-react';
import { ContentLabNodeKind } from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_NODE_META, CONTENT_LAB_NODE_ROLES, type ContentLabNodeRole } from '../../_constants';
import { NodeIcon, ROLE_STYLE } from './NodeRole';

/** The example board drawn in the banner: a reel from top posts, column by column, with what travels on each wire. */
const EXAMPLE: { role: ContentLabNodeRole; kinds: ContentLabNodeKind[]; sends: string }[] = [
    { role: 'input', kinds: [ContentLabNodeKind.WORKING, ContentLabNodeKind.VOICE, ContentLabNodeKind.NOTE], sends: '12 top posts, your tone' },
    { role: 'step', kinds: [ContentLabNodeKind.HOOKS, ContentLabNodeKind.WRITE], sends: 'a writing brief' },
    { role: 'output', kinds: [ContentLabNodeKind.OUTPUT, ContentLabNodeKind.CHECK], sends: '' },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: MousePointerClick, title: 'Pick a template', text: 'It comes already wired, so you never start blank.' },
    { icon: Play, title: 'Add a topic or link, then Run', text: 'Every box fills itself from real posts, on your own AI key.' },
    { icon: CalendarClock, title: 'Or let it run by itself', text: 'Daily or weekly, with fresh drafts waiting for you.' },
];

/** The wire between two columns, with what travels on it: across on wide screens, down on phones. */
function Wire({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center gap-2 md:flex-col md:gap-1" aria-hidden>
            <ArrowDown className="text-muted-foreground size-4 md:hidden" />
            <ArrowRight className="text-muted-foreground hidden size-4 md:block" />
            <span className="bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                {label}
            </span>
        </div>
    );
}

/**
 * Top of the Boards page on a dotted canvas: what a board is, in one line and three steps, then a small example board
 * across the full width (Inputs → Steps → Outputs, each in its colour, with what travels on the wires).
 */
export function HowBoardsWork() {
    return (
        <section
            aria-labelledby="how-boards-work"
            className="relative overflow-hidden rounded-2xl border bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]"
        >
            <div className="bg-background/80 flex flex-col gap-8 p-5 sm:p-8">
                <div className="grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-10">
                    <div className="flex flex-col gap-2">
                        <p className="text-primary text-xs font-semibold tracking-wide uppercase">How a board works</p>
                        <h2 id="how-boards-work" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                            A board turns top posts into your next post
                        </h2>
                        <p className="text-muted-foreground">
                            Boxes on the left bring ideas in, the middle ones find what works and write a brief, and the ones on the right
                            are drafts ready to post. Each wire says what it carries.
                        </p>
                    </div>
                    <ol className="flex flex-col gap-3 sm:grid sm:grid-cols-3 lg:flex lg:flex-col">
                        {STEPS.map(({ icon: Icon, title, text }, index) => (
                            <li key={title} className="flex items-start gap-3">
                                <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">
                                    {index + 1}
                                </span>
                                <span className="flex flex-col">
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <Icon className="text-muted-foreground size-4" aria-hidden />
                                        {title}
                                    </span>
                                    <span className="text-muted-foreground text-sm">{text}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>

                <figure className="flex flex-col gap-3" aria-label="An example board: a reel from top posts">
                    <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
                        {EXAMPLE.map(({ role, kinds, sends }, index) => (
                            <Fragment key={role}>
                                <div className={cn('bg-card flex flex-col gap-2 rounded-xl border border-t-4 p-3 shadow-sm', ROLE_STYLE[role].edge)}>
                                    <p className="flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-semibold">
                                            {index + 1} · {CONTENT_LAB_NODE_ROLES[role].plural}
                                        </span>
                                    </p>
                                    <p className="text-muted-foreground text-xs">{CONTENT_LAB_NODE_ROLES[role].hint}</p>
                                    <ul className="flex flex-col gap-1.5 pt-1">
                                        {kinds.map((kind) => (
                                            <li key={kind} className="bg-background flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm font-medium">
                                                <NodeIcon kind={kind} className="size-6 [&_svg]:size-3.5" />
                                                <span className="min-w-0 truncate">{CONTENT_LAB_NODE_META[kind].label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {sends ? <Wire label={sends} /> : null}
                            </Fragment>
                        ))}
                    </div>
                    <figcaption className="text-muted-foreground text-center text-xs">The “Reel from top posts” template, as it opens.</figcaption>
                </figure>
            </div>
        </section>
    );
}
