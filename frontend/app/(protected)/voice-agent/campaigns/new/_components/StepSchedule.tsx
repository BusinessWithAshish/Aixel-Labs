'use client';

import { Controller, type FieldPath, useFormContext } from 'react-hook-form';
import { VOICE_CAMPAIGN_LIMITS } from '@aixellabs/backend/db/types';
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { VoiceCampaignSettingsInput } from '@/helpers/voice-schemas';
import { minutesLabel, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import { RETRY_DELAY_MINUTES, RETRY_OUTCOMES } from '../../_utils/campaign-format';

type ScheduleValues = Pick<VoiceCampaignSettingsInput, 'window' | 'maxConcurrent' | 'retry'>;

const CONCURRENCY = Array.from({ length: VOICE_CAMPAIGN_LIMITS.maxConcurrent }, (_, i) => i + 1);
const RETRIES = Array.from({ length: VOICE_CAMPAIGN_LIMITS.maxRetries + 1 }, (_, i) => i);

/** A select of numbers (calls at once, retries, minutes), each option in words. */
function NumberSelect({
    name,
    id,
    label,
    options,
    optionLabel,
    description,
    disabled,
    className,
}: {
    name: FieldPath<ScheduleValues>;
    id: string;
    label: string;
    options: readonly number[];
    optionLabel: (n: number) => string;
    description?: string;
    disabled?: boolean;
    className?: string;
}) {
    const { control } = useFormContext<ScheduleValues>();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <Field className={className}>
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))} disabled={disabled}>
                        <SelectTrigger id={id} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {optionLabel(n)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {description ? <FieldDescription className="text-xs">{description}</FieldDescription> : null}
                </Field>
            )}
        />
    );
}

/** Adds or removes one value from a list field (calling days, outcomes to retry). */
function toggled<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function StepSchedule() {
    const { control, register, watch } = useFormContext<ScheduleValues>();
    const noRetries = watch('retry.maxRetries') === 0;

    return (
        <div className="flex flex-col gap-6">
            <FieldSet>
                <FieldLegend variant="label">Calling days</FieldLegend>
                <FieldDescription className="text-xs">
                    Calls only start inside these hours, on the campaign’s clock.
                </FieldDescription>
                <Controller
                    control={control}
                    name="window.days"
                    render={({ field }) => (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Calling days">
                            {VOICE_WEEKDAY_OPTIONS.map((day) => {
                                const on = field.value.includes(day.key);
                                return (
                                    <Button
                                        key={day.key}
                                        type="button"
                                        size="sm"
                                        variant={on ? 'default' : 'outline'}
                                        aria-pressed={on}
                                        className="w-12"
                                        onClick={() => field.onChange(toggled(field.value, day.key))}
                                    >
                                        {day.short}
                                    </Button>
                                );
                            })}
                        </div>
                    )}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field>
                        <FieldLabel htmlFor="campaign-start">From</FieldLabel>
                        <Input id="campaign-start" type="time" step={60} {...register('window.start')} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="campaign-end">Until</FieldLabel>
                        <Input id="campaign-end" type="time" step={60} {...register('window.end')} />
                    </Field>
                    <Controller
                        control={control}
                        name="window.timezone"
                        render={({ field }) => (
                            <Field className="min-w-0">
                                <FieldLabel htmlFor="campaign-timezone">Timezone</FieldLabel>
                                <TimezoneSelect id="campaign-timezone" value={field.value} onChange={field.onChange} />
                            </Field>
                        )}
                    />
                </div>
            </FieldSet>

            <NumberSelect
                name="maxConcurrent"
                id="campaign-concurrency"
                label="Calls at once"
                options={CONCURRENCY}
                optionLabel={(n) => `${n} ${n === 1 ? 'call' : 'calls'} at a time`}
                description={`Up to ${VOICE_CAMPAIGN_LIMITS.maxConcurrent} per number. Fewer keeps your agent free for calls coming in.`}
            />

            <FieldSet>
                <FieldLegend variant="label">Try again</FieldLegend>
                <FieldDescription className="text-xs">
                    When a call is not answered, it is placed again later, inside the calling hours.
                </FieldDescription>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberSelect
                        name="retry.maxRetries"
                        id="campaign-retries"
                        label="Retries per contact"
                        options={RETRIES}
                        optionLabel={(n) => (n === 0 ? 'Don’t retry' : `${n} ${n === 1 ? 'retry' : 'retries'}`)}
                    />
                    <NumberSelect
                        name="retry.delayMinutes"
                        id="campaign-delay"
                        label="Wait before retrying"
                        options={RETRY_DELAY_MINUTES}
                        optionLabel={minutesLabel}
                        disabled={noRetries}
                    />
                </div>
                <Controller
                    control={control}
                    name="retry.on"
                    render={({ field }) => (
                        <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Retry when">
                            {RETRY_OUTCOMES.map((outcome) => (
                                <label key={outcome.value} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={field.value.includes(outcome.value)}
                                        disabled={noRetries}
                                        onCheckedChange={() => field.onChange(toggled(field.value, outcome.value))}
                                    />
                                    {outcome.label}
                                </label>
                            ))}
                        </div>
                    )}
                />
            </FieldSet>
        </div>
    );
}
