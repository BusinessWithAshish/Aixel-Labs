'use client';

import Link from 'next/link';
import { CalendarCheck, CalendarSearch, ChevronRight, PhoneOff, Webhook, type LucideIcon } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { SubModuleUrls } from '@/config/app-config';
import { cn } from '@/lib/utils';
import { formatToolArguments, summarizeToolRun, type ToolRun, type ToolRunKind } from '@/helpers/voice-tool-calls';

const BOOKINGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS];

const KIND_ICON: Record<ToolRunKind, LucideIcon> = {
    availability: CalendarSearch,
    booking: CalendarCheck,
    end: PhoneOff,
    webhook: Webhook,
};

type ToolCallRowProps = {
    run: ToolRun;
    className?: string;
};

/** One tool the agent used, as a compact line; opens to show what it sent and what came back. */
export function ToolCallRow({ run, className }: ToolCallRowProps) {
    const summary = summarizeToolRun(run);
    const Icon = KIND_ICON[summary.kind];
    const bookingHref = summary.booked ? (run.bookingId ? `${BOOKINGS_URL}#booking-${run.bookingId}` : BOOKINGS_URL) : null;
    const hasArguments = Object.keys(run.arguments ?? {}).length > 0;

    return (
        <details
            className={cn('group bg-muted/40 w-full min-w-0 rounded-md border border-dashed text-xs', className)}
            data-testid="tool-call"
            data-tool={run.name}
            data-ok={run.ok}
        >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                    className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90"
                    aria-hidden
                />
                <Icon
                    className={cn(
                        'size-3.5 shrink-0',
                        summary.booked ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground',
                    )}
                    aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium" title={summary.title}>
                    {bookingHref ? (
                        <Link
                            href={bookingHref}
                            className="underline-offset-4 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                            data-testid="tool-call-booking-link"
                        >
                            {summary.title}
                        </Link>
                    ) : (
                        summary.title
                    )}
                </span>
                {summary.status ? (
                    <Badge variant={summary.status.ok ? 'green' : 'red'} data-testid="tool-call-status">
                        {summary.status.label}
                    </Badge>
                ) : null}
            </summary>
            <div className="grid gap-2 border-t border-dashed px-2.5 py-2">
                {hasArguments ? (
                    <div className="grid gap-1">
                        <span className="text-muted-foreground font-medium">Sent</span>
                        <pre className="bg-background overflow-x-auto rounded border p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all">
                            {formatToolArguments(run.arguments)}
                        </pre>
                    </div>
                ) : null}
                <div className="grid gap-1">
                    <span className="text-muted-foreground font-medium">
                        Answer{typeof run.durationMs === 'number' && run.durationMs > 0 ? ` · ${run.durationMs} ms` : ''}
                    </span>
                    <pre className="bg-background overflow-x-auto rounded border p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words">
                        {run.result?.trim() || 'Nothing came back.'}
                    </pre>
                </div>
            </div>
        </details>
    );
}
