import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { Badge } from '@/components/ui/badge';
import { SubModuleUrls } from '@/config/app-config';
import { replyTone, TONE_TEXT } from '@/helpers/voice-call-outcomes';
import { formatShortDateTime } from '@/helpers/voice-time';
import { callBookedSomething } from '@/helpers/voice-tool-calls';
import { formatDuration, formatGap, formatParty, median } from '@/helpers/voice-call-format';
import { CallCostAmount, CallCostPerMinute } from './CallCost';
import { CallEndedBy } from './CallEndedBy';
import { CallOutcomeBadges } from './CallOutcomeBadges';
import { CallTypeBadge } from './CallTypeBadge';
import { cn } from '@/lib/utils';

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

/**
 * One call in Call logs, the same on a phone and a desktop: agent and type, who and when, cost at the
 * top right; then the summary, and how it went in the colours Analytics uses.
 */
export function CallCard({ call }: { call: VoiceCallListItem }) {
    const summary = call.analysis?.summary;
    const gap = median(call.gapsMs);

    return (
        <Link
            href={`${CALL_LOGS_URL}/${call._id}`}
            data-testid="call-card"
            className="bg-card hover:bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors sm:p-4"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('font-medium', !call.agentName && 'text-muted-foreground italic')}>
                            {call.agentName ?? 'Deleted agent'}
                        </span>
                        <CallTypeBadge channel={call.channel} direction={call.direction} />
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                        <Parties call={call} />
                        <time dateTime={call.startedAt} suppressHydrationWarning>
                            {formatShortDateTime(call.startedAt)}
                        </time>
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-base font-semibold">
                        <CallCostAmount cost={call.cost} />
                    </span>
                    <CallCostPerMinute
                        cost={call.cost}
                        durationSec={call.durationSec}
                        className="text-muted-foreground text-xs tabular-nums"
                    />
                </div>
            </div>
            {summary ? (
                <p className="text-muted-foreground line-clamp-2" data-testid="call-summary" title={summary}>
                    {summary}
                </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <span className="font-medium">
                    <CallEndedBy endedBy={call.endedBy} />
                </span>
                <CallOutcomeBadges analysis={call.analysis} />
                {callBookedSomething(call.toolCalls) ? (
                    <Badge variant="outline" className="gap-1 text-teal-700 dark:text-teal-300" data-testid="call-booked">
                        <CalendarCheck aria-hidden />
                        Booked
                    </Badge>
                ) : null}
                <span className="text-muted-foreground flex gap-3 tabular-nums sm:ml-auto">
                    <span>{formatDuration(call.durationSec)} long</span>
                    {gap !== null ? <span className={TONE_TEXT[replyTone(gap)]}>answers in {formatGap(gap)}</span> : null}
                </span>
            </div>
        </Link>
    );
}
