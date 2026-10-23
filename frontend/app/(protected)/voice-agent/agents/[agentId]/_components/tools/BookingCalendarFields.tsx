'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { VOICE_BOOKING_LIMITS, VOICE_WEEKDAYS } from '@aixellabs/backend/db/types';
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePage } from '@/contexts/PageStore';
import { VOICE_BOOKING_SLOT_OPTIONS } from '@/helpers/voice-agent-defaults';
import type { BookingFormValues } from '@/helpers/voice-schemas';
import { minutesLabel, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

const TIME_INPUT = 'h-8 w-0 min-w-0 flex-1 px-2 tabular-nums sm:w-32 sm:flex-none';

/** Mon..Sun: open or closed, and from / to when open. */
function BookingHoursGrid() {
    const { control, register, watch } = useFormContext<BookingFormValues>();
    const days = watch('days');

    return (
        <ul
            className="bg-background divide-y rounded-md border"
            aria-labelledby="booking-hours-label"
            data-testid="booking-hours"
        >
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

/** The times callers are offered: timezone, appointment length, how far ahead, opening hours. */
export function BookingCalendarFields() {
    const { bookingForm, booking } = usePage<UseVoiceAgentEditorPageReturn>();
    const { control, register } = bookingForm;
    const slotOptions: number[] = VOICE_BOOKING_SLOT_OPTIONS.includes(
        booking.slotMinutes as (typeof VOICE_BOOKING_SLOT_OPTIONS)[number],
    )
        ? [...VOICE_BOOKING_SLOT_OPTIONS]
        : [...VOICE_BOOKING_SLOT_OPTIONS, booking.slotMinutes].sort((a, b) => a - b);

    return (
        <div className="grid gap-4" data-testid="booking-settings">
            <div className="grid gap-4 sm:grid-cols-3">
                <Controller
                    control={control}
                    name="timezone"
                    render={({ field }) => (
                        <Field className="min-w-0">
                            <FieldLabel htmlFor="booking-timezone">Timezone</FieldLabel>
                            <TimezoneSelect id="booking-timezone" value={field.value} onChange={field.onChange} />
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
                                <SelectTrigger id="booking-slot" className="bg-background w-full">
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
                            className="bg-background w-20"
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
                    Callers are offered start times every {minutesLabel(booking.slotMinutes)} within these hours, never one
                    that is already booked.
                </FieldDescription>
            </Field>
        </div>
    );
}

/** "Mon-Fri 09:00-17:00, 30 min, up to 14 days ahead (Asia/Kolkata)": the offered times in one line. */
export function bookingTimesSummary(booking: BookingFormValues): string {
    const open = VOICE_WEEKDAYS.filter((day) => booking.days[day].open);
    const days = open.length
        ? open.map(
              (day) =>
                  `${VOICE_WEEKDAY_OPTIONS.find((d) => d.key === day)?.label.slice(0, 3)} ${booking.days[day].from}-${booking.days[day].to}`,
          )
        : ['no open days'];
    return `${minutesLabel(booking.slotMinutes)} appointments, up to ${booking.maxDaysAhead} days ahead (${booking.timezone}): ${days.join(', ')}`;
}
