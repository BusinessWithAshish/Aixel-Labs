'use client';

import { VOICE_CAMPAIGN_LIMITS } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
// Shared with the booking tool's settings (same searchable list of IANA zones).
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';
import { minutesLabel, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import { RETRY_DELAY_MINUTES, RETRY_OUTCOMES } from '../../_utils/campaign-format';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

const CONCURRENCY = Array.from({ length: VOICE_CAMPAIGN_LIMITS.maxConcurrent }, (_, i) => i + 1);
const RETRIES = Array.from({ length: VOICE_CAMPAIGN_LIMITS.maxRetries + 1 }, (_, i) => i);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <div>
                <h3 className="text-sm font-medium">{title}</h3>
                {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
            </div>
            {children}
        </section>
    );
}

export function StepSchedule() {
    const { callWindow, setCallWindow, toggleDay, maxConcurrent, setMaxConcurrent, retry, setRetry, toggleRetryOn } =
        usePage<UseNewCampaignPageReturn>();

    return (
        <div className="flex flex-col gap-6">
            <Section title="Calling days" hint="Calls only start inside these hours, on the campaign’s clock.">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Calling days">
                    {VOICE_WEEKDAY_OPTIONS.map((day) => {
                        const on = callWindow.days.includes(day.key);
                        return (
                            <Button
                                key={day.key}
                                type="button"
                                size="sm"
                                variant={on ? 'default' : 'outline'}
                                aria-pressed={on}
                                className="w-12"
                                onClick={() => toggleDay(day.key)}
                            >
                                {day.short}
                            </Button>
                        );
                    })}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="campaign-start">From</Label>
                        <Input
                            id="campaign-start"
                            type="time"
                            step={60}
                            value={callWindow.start}
                            onChange={(e) => setCallWindow((w) => ({ ...w, start: e.target.value }))}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="campaign-end">Until</Label>
                        <Input
                            id="campaign-end"
                            type="time"
                            step={60}
                            value={callWindow.end}
                            onChange={(e) => setCallWindow((w) => ({ ...w, end: e.target.value }))}
                        />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="campaign-timezone">Timezone</Label>
                        <TimezoneSelect
                            id="campaign-timezone"
                            value={callWindow.timezone}
                            onChange={(timezone) => setCallWindow((w) => ({ ...w, timezone }))}
                        />
                    </div>
                </div>
            </Section>

            <Section
                title="Calls at once"
                hint={`Up to ${VOICE_CAMPAIGN_LIMITS.maxConcurrent} per number. Fewer keeps your agent free for calls coming in.`}
            >
                <Select value={String(maxConcurrent)} onValueChange={(v) => setMaxConcurrent(Number(v))}>
                    <SelectTrigger id="campaign-concurrency" className="w-full sm:w-48" aria-label="Calls at once">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CONCURRENCY.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                                {n} {n === 1 ? 'call' : 'calls'} at a time
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Section>

            <Section title="Try again" hint="When a call is not answered, it is placed again later, inside the calling hours.">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="campaign-retries">Retries per contact</Label>
                        <Select
                            value={String(retry.maxRetries)}
                            onValueChange={(v) => setRetry((r) => ({ ...r, maxRetries: Number(v) }))}
                        >
                            <SelectTrigger id="campaign-retries" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RETRIES.map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                        {n === 0 ? 'Don’t retry' : `${n} ${n === 1 ? 'retry' : 'retries'}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="campaign-delay">Wait before retrying</Label>
                        <Select
                            value={String(retry.delayMinutes)}
                            disabled={retry.maxRetries === 0}
                            onValueChange={(v) => setRetry((r) => ({ ...r, delayMinutes: Number(v) }))}
                        >
                            <SelectTrigger id="campaign-delay" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RETRY_DELAY_MINUTES.map((minutes) => (
                                    <SelectItem key={minutes} value={String(minutes)}>
                                        {minutesLabel(minutes)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Retry when">
                    {RETRY_OUTCOMES.map((outcome) => (
                        <label key={outcome.value} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={retry.on.includes(outcome.value)}
                                disabled={retry.maxRetries === 0}
                                onCheckedChange={() => toggleRetryOn(outcome.value)}
                            />
                            {outcome.label}
                        </label>
                    ))}
                </div>
            </Section>
        </div>
    );
}
