import type { VoiceCampaignStats } from '@/app/actions/voice-campaign-actions';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { progressPercent } from '../_utils/campaign-format';

type CampaignProgressProps = {
    stats: VoiceCampaignStats;
    /** All the outcome tiles (detail page); the list shows the four headline ones. */
    detailed?: boolean;
    className?: string;
};

function Stat({ label, value, hint, testId }: { label: string; value: number; hint?: string; testId: string }) {
    return (
        <div className="flex min-w-0 flex-col" title={hint} data-testid={`stat-${testId}`}>
            <span className="text-lg font-semibold tabular-nums leading-tight">{value.toLocaleString()}</span>
            <span className="text-muted-foreground truncate text-xs">{label}</span>
        </div>
    );
}

/** Settled share as a bar, then called / answered / booked / failed (and the rest when detailed). */
export function CampaignProgress({ stats, detailed = false, className }: CampaignProgressProps) {
    const percent = progressPercent(stats);
    const failed = stats.unreached + stats.failed;
    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="flex flex-col gap-1.5">
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>
                        <span className="tabular-nums">{(stats.total - stats.pending - stats.calling).toLocaleString()}</span> of{' '}
                        <span className="tabular-nums">{stats.total.toLocaleString()}</span> done
                        {stats.calling ? (
                            <>
                                {' · '}
                                <span className="text-primary tabular-nums" data-testid="stat-calling">
                                    {stats.calling} on a call now
                                </span>
                            </>
                        ) : null}
                    </span>
                    <span className="tabular-nums">{percent}%</span>
                </div>
                <Progress value={percent} aria-label="Campaign progress" />
            </div>
            <div className={cn('grid grid-cols-4 gap-3', detailed && 'sm:grid-cols-7')}>
                <Stat label="Called" value={stats.called} testId="called" hint="Contacts called at least once" />
                <Stat label="Answered" value={stats.answered} testId="answered" />
                <Stat label="Booked" value={stats.booked} testId="booked" hint="The agent booked an appointment" />
                <Stat
                    label="Failed"
                    value={failed}
                    testId="failed"
                    hint="Not reached after every try, or the call could not be placed"
                />
                {detailed ? (
                    <>
                        <Stat label="Waiting" value={stats.pending} testId="pending" hint="Not called yet, or waiting for a retry" />
                        <Stat
                            label="Do not call"
                            value={stats.skipped}
                            testId="skipped"
                            hint="On the do-not-call list: never called"
                        />
                        <Stat label="Contacts" value={stats.total} testId="total" />
                    </>
                ) : null}
            </div>
        </div>
    );
}
