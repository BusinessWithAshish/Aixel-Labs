'use client';

import Link from 'next/link';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { CalendarCheck } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VOICE_BOOKING_LIMITS } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { VOICE_BOOKING_SLOT_OPTIONS } from '@/helpers/voice-agent-defaults';
import type { BookingFormValues } from '@/helpers/voice-schemas';
import { minutesLabel, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { BookingDestinationField } from './BookingDestinationField';
import { ToolSummary } from './ToolSummary';

const TIME_INPUT = 'h-8 w-0 min-w-0 flex-1 px-2 tabular-nums sm:w-32 sm:flex-none';

/** Mon..Sun: open or closed, and from / to when open. */
function BookingHoursGrid() {
    const { control, register, watch } = useFormContext<BookingFormValues>();
    const days = watch('days');

    return (
        <ul className="divide-y rounded-md border" aria-labelledby="booking-hours-label" data-testid="booking-hours">
            {VOICE_WEEKDAY_OPTIONS.map(({ key, label }) => (
                <li
                    key={key}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:py-1.5"
                    data-testid={`booking-day-${key}`}
                >
                    <Controller
                        control={control}
                        name={`days.${key}.open`}
                        render={({ field }) => (
                            <Switch
                                id={`booking-${key}-open`}
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                aria-label={`Open on ${label}`}
                            />
                        )}
                    />
                    <Label htmlFor={`booking-${key}-open`} className="flex-1 font-normal sm:w-24 sm:flex-none">
                        {label}
                    </Label>
                    {days[key].open ? (
                        // Under the day on a phone, beside it from sm up.
                        <div className="flex w-full min-w-0 items-center gap-2 pl-11 sm:w-auto sm:pl-0">
                            <Input
                                type="time"
                                step={300}
                                aria-label={`${label} opens at`}
                                className={TIME_INPUT}
                                {...register(`days.${key}.from`)}
                            />
                            <span className="text-muted-foreground text-xs">to</span>
                            <Input
                                type="time"
                                step={300}
                                aria-label={`${label} closes at`}
                                className={TIME_INPUT}
                                {...register(`days.${key}.to`)}
                            />
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">Closed</span>
                    )}
                </li>
            ))}
        </ul>
    );
}

/**
 * Booking: on/off, where bookings go (built-in or a connected app), hours, length, how far ahead, and the
 * two tools it gives the agent. Saved with the Tools card's Save.
 */
export function BookingToolSection() {
    const { bookingForm, booking, promptTools } = usePage<UseVoiceAgentEditorPageReturn>();
    const { control, register } = bookingForm;

    const slotOptions: number[] = VOICE_BOOKING_SLOT_OPTIONS.includes(
        booking.slotMinutes as (typeof VOICE_BOOKING_SLOT_OPTIONS)[number],
    )
        ? [...VOICE_BOOKING_SLOT_OPTIONS]
        : [...VOICE_BOOKING_SLOT_OPTIONS, booking.slotMinutes].sort((a, b) => a - b);

    return (
        <FormProvider {...bookingForm}>
            <SettingsSection
                titleId="booking-tool-title"
                icon={CalendarCheck}
                title="Appointment booking"
                description={
                    <>
                        The agent checks your free times and books callers in. Bookings appear in{' '}
                        <Link
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]}
                            className="text-primary underline-offset-4 hover:underline"
                        >
                            Bookings
                        </Link>
                        .
                    </>
                }
                action={
                    <Controller
                        control={control}
                        name="enabled"
                        render={({ field }) => (
                            <Switch
                                id="booking-enabled"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                aria-label="Appointment booking"
                                className="mt-1"
                            />
                        )}
                    />
                }
                className="gap-4"
                data-testid="booking-tool"
            >
                {booking.enabled ? (
                    <div className="grid gap-4" data-testid="booking-settings">
                        <BookingDestinationField />
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Controller
                                control={control}
                                name="timezone"
                                render={({ field }) => (
                                    <Field className="min-w-0">
                                        <FieldLabel htmlFor="booking-timezone">Timezone</FieldLabel>
                                        <TimezoneSelect
                                            id="booking-timezone"
                                            value={field.value}
                                            onChange={field.onChange}
                                        />
                                    </Field>
                                )}
                            />
                            <Controller
                                control={control}
                                name="slotMinutes"
                                render={({ field }) => (
                                    <Field className="min-w-0">
                                        <FieldLabel htmlFor="booking-slot">Appointment length</FieldLabel>
                                        <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                                            <SelectTrigger id="booking-slot" className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {slotOptions.map((minutes) => (
                                                    <SelectItem key={minutes} value={String(minutes)}>
                                                        {minutesLabel(minutes)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            />
                            <Field className="min-w-0">
                                <FieldLabel htmlFor="booking-days-ahead">Book up to</FieldLabel>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="booking-days-ahead"
                                        type="number"
                                        inputMode="numeric"
                                        min={VOICE_BOOKING_LIMITS.maxDaysAheadMin}
                                        max={VOICE_BOOKING_LIMITS.maxDaysAheadMax}
                                        className="w-20"
                                        {...register('maxDaysAhead', { valueAsNumber: true })}
                                    />
                                    <span className="text-muted-foreground text-sm">days ahead</span>
                                </div>
                            </Field>
                        </div>

                        <Field>
                            <FieldTitle id="booking-hours-label">Opening hours</FieldTitle>
                            <BookingHoursGrid />
                            <FieldDescription className="text-xs">
                                Callers are offered start times every {minutesLabel(booking.slotMinutes)} within these hours,
                                never one that is already booked.
                            </FieldDescription>
                        </Field>
                    </div>
                ) : null}

                <Field>
                    <FieldTitle id="booking-tools-label">Tools the agent gets</FieldTitle>
                    <ul
                        className="divide-y rounded-md border"
                        aria-labelledby="booking-tools-label"
                        data-testid="booking-tools"
                    >
                        {promptTools
                            .filter((tool) => tool.kind === 'booking')
                            .map((tool) => (
                                <li key={tool.name} className="flex px-3 py-2" data-testid="booking-tool-row">
                                    <ToolSummary
                                        tool={tool}
                                        badges={tool.on ? null : <Badge variant="secondary">Off</Badge>}
                                    />
                                </li>
                            ))}
                    </ul>
                    <FieldDescription className="text-xs">
                        Both work on the same calendar. Type / in the prompt to name one.
                    </FieldDescription>
                </Field>
            </SettingsSection>
        </FormProvider>
    );
}
