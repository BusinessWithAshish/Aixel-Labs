import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { Badge } from '@/components/ui/badge';
import { SubModuleUrls } from '@/config/app-config';
import { endedByLabel } from '@/helpers/voice-call-outcomes';
import { formatShortDateTime } from '@/helpers/voice-time';
import { callBookedSomething } from '@/helpers/voice-tool-calls';
import { formatDuration, formatGap, formatParty, median } from '@/helpers/voice-call-format';
import { CallCostAmount, CallCostPerMinute } from './CallCost';
import { CallOutcomeBadges } from './CallOutcomeBadges';
import { CallTypeBadge } from './CallTypeBadge';

const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

function Parties({ call }: { call: VoiceCallListItem }) {
    if (!call.from && !call.to) return <span>Browser</span>;
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            {formatParty(call.from, 'Unknown')}
            <ArrowRight className="size-3 shrink-0" aria-label="to" />
            {formatParty(call.to, 'Unknown')}
        </span>
    );
}

/** One call in Call logs, the same on a phone and a desktop: who and which agent, its verdicts, cost at the right. */
export function CallCard({ call }: { call: VoiceCallListItem }) {
    const summary = call.analysis?.summary;
    const gap = median(call.gapsMs);

    return (
        <Link
            href={`${CALL_LOGS_URL}/${call._id}`}
            data-testid="call-card"
            className="hover:bg-muted/50 grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-[1fr_auto]"
        >
            <div className="grid min-w-0 gap-2">
                <div className="grid gap-0.5">
                    <span className="font-medium">{call.agentName ?? 'Deleted agent'}</span>
                    <span className="text-muted-foreground">
                        <Parties call={call} />
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <CallTypeBadge channel={call.channel} direction={call.direction} />
                    {callBookedSomething(call.toolCalls) ? (
                        <Badge
                            variant="outline"
                            className="gap-1 text-teal-700 dark:text-teal-300"
                            data-testid="call-booked"
                        >
                            <CalendarCheck aria-hidden />
                            Booked
                        </Badge>
                    ) : null}
                    <CallOutcomeBadges analysis={call.analysis} />
                </div>
                {summary ? (
                    <p className="text-muted-foreground line-clamp-2 text-xs" data-testid="call-summary" title={summary}>
                        {summary}
                    </p>
                ) : null}
                <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <time dateTime={call.startedAt} suppressHydrationWarning>
                        {formatShortDateTime(call.startedAt)}
                    </time>
                    <span className="tabular-nums">{formatDuration(call.durationSec)} long</span>
                    <span>{endedByLabel(call.endedBy)}</span>
                    {gap !== null ? <span className="tabular-nums">answers in {formatGap(gap)}</span> : null}
                </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t pt-2 sm:flex-col sm:items-end sm:justify-start sm:border-t-0 sm:pt-0">
                <span className="text-base font-semibold">
                    <CallCostAmount cost={call.cost} />
                </span>
                <CallCostPerMinute
                    cost={call.cost}
                    durationSec={call.durationSec}
                    className="text-muted-foreground text-xs tabular-nums"
                />
            </div>
        </Link>
    );
}
