'use client';

import Link from 'next/link';
import { CalendarCheck, Loader2, Save } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VOICE_BOOKING_LIMITS } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { VOICE_BOOKING_SLOT_OPTIONS } from '@/helpers/voice-agent-defaults';
import { cn } from '@/lib/utils';
import { minutesLabel, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { BookingDestinationField } from './BookingDestinationField';
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';

/** Mon..Sun: open or closed, and from / to when open. */
function BookingHoursGrid() {
    const { bookingDraft, setBookingDay, savingBooking } = usePage<UseVoiceAgentEditorPageReturn>();

    return (
        <ul className="divide-y rounded-md border" aria-labelledby="booking-hours-label" data-testid="booking-hours">
            {VOICE_WEEKDAY_OPTIONS.map(({ key, label }) => {
                const day = bookingDraft.days[key];
                const switchId = `booking-${key}-open`;
                return (
                    <li
                        key={key}
                        className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:py-1.5"
                        data-testid={`booking-day-${key}`}
                    >
                        <Switch
                            id={switchId}
                            checked={day.open}
                            onCheckedChange={(open) => setBookingDay(key, { open })}
                            disabled={savingBooking}
                            aria-label={`Open on ${label}`}
                        />
                        <Label htmlFor={switchId} className="flex-1 font-normal sm:w-24 sm:flex-none">
                            {label}
                        </Label>
                        {day.open ? (
                            // Under the day on a phone, beside it from sm up.
                            <div className="flex w-full min-w-0 items-center gap-2 pl-11 sm:w-auto sm:pl-0">
                                <Input
                                    type="time"
                                    step={300}
                                    value={day.from}
                                    onChange={(e) => setBookingDay(key, { from: e.target.value })}
                                    disabled={savingBooking}
                                    aria-label={`${label} opens at`}
                                    className="h-8 w-0 min-w-0 flex-1 px-2 tabular-nums sm:w-32 sm:flex-none"
                                />
                                <span className="text-muted-foreground text-xs">to</span>
                                <Input
                                    type="time"
                                    step={300}
                                    value={day.to}
                                    onChange={(e) => setBookingDay(key, { to: e.target.value })}
                                    disabled={savingBooking}
                                    aria-label={`${label} closes at`}
                                    className="h-8 w-0 min-w-0 flex-1 px-2 tabular-nums sm:w-32 sm:flex-none"
                                />
                            </div>
                        ) : (
                            <span className="text-muted-foreground text-sm">Closed</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

/** Built-in booking: on/off, timezone, hours, appointment length and how far ahead. Saved on its own. */
export function BookingToolSection() {
    const {
        bookingDraft,
        bookingDirty,
        bookingError,
        canSaveBooking,
        savingBooking,
        setBookingEnabled,
        setBookingTimezone,
        setBookingSlotMinutes,
        setBookingMaxDaysAhead,
        discardBookingChanges,
        saveBooking,
    } = usePage<UseVoiceAgentEditorPageReturn>();

    const slotOptions: number[] = VOICE_BOOKING_SLOT_OPTIONS.includes(
        bookingDraft.slotMinutes as (typeof VOICE_BOOKING_SLOT_OPTIONS)[number],
    )
        ? [...VOICE_BOOKING_SLOT_OPTIONS]
        : [...VOICE_BOOKING_SLOT_OPTIONS, bookingDraft.slotMinutes].sort((a, b) => a - b);

    return (
        <section className="grid gap-4" aria-labelledby="booking-tool-title" data-testid="booking-tool">
            <div className="flex items-start justify-between gap-4">
                <div className="grid gap-1">
                    <h3 id="booking-tool-title" className="flex flex-wrap items-center gap-2 font-medium">
                        <CalendarCheck className="text-muted-foreground size-4" />
                        Appointment booking
                        {bookingDirty ? (
                            <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Unsaved changes</span>
                        ) : null}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        The agent checks your free times and books callers in. Bookings appear in{' '}
                        <Link
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]}
                            className="text-primary underline-offset-4 hover:underline"
                        >
                            Bookings
                        </Link>
                        .
                    </p>
                </div>
                <Switch
                    id="booking-enabled"
                    checked={bookingDraft.enabled}
                    onCheckedChange={setBookingEnabled}
                    disabled={savingBooking}
                    aria-label="Appointment booking"
                    className="mt-1"
                />
            </div>

            {bookingDraft.enabled ? (
                <div className="grid gap-4" data-testid="booking-settings">
                    <BookingDestinationField />
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid min-w-0 gap-2">
                            <Label htmlFor="booking-timezone">Timezone</Label>
                            <TimezoneSelect
                                id="booking-timezone"
                                value={bookingDraft.timezone}
                                onChange={setBookingTimezone}
                                disabled={savingBooking}
                            />
                        </div>
                        <div className="grid min-w-0 gap-2">
                            <Label htmlFor="booking-slot">Appointment length</Label>
                            <Select
                                value={String(bookingDraft.slotMinutes)}
                                onValueChange={(v) => setBookingSlotMinutes(Number(v))}
                                disabled={savingBooking}
                            >
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
                        </div>
                        <div className="grid min-w-0 gap-2">
                            <Label htmlFor="booking-days-ahead">Book up to</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="booking-days-ahead"
                                    type="number"
                                    inputMode="numeric"
                                    min={VOICE_BOOKING_LIMITS.maxDaysAheadMin}
                                    max={VOICE_BOOKING_LIMITS.maxDaysAheadMax}
                                    value={bookingDraft.maxDaysAhead}
                                    onChange={(e) => setBookingMaxDaysAhead(e.target.value)}
                                    disabled={savingBooking}
                                    className="w-20"
                                />
                                <span className="text-muted-foreground text-sm">days ahead</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <p id="booking-hours-label" className="text-sm leading-none font-medium">
                            Opening hours
                        </p>
                        <BookingHoursGrid />
                        <p className="text-muted-foreground text-xs">
                            Callers are offered start times every {minutesLabel(bookingDraft.slotMinutes)} within these
                            hours, never one that is already booked.
                        </p>
                    </div>
                </div>
            ) : null}

            {bookingDirty ? (
                <div className={cn('flex flex-wrap items-center justify-end gap-2', bookingError && 'justify-between')}>
                    {bookingError ? (
                        <p className="text-destructive text-sm" role="alert" data-testid="booking-error">
                            {bookingError}
                        </p>
                    ) : null}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={discardBookingChanges}
                            disabled={savingBooking}
                        >
                            Discard
                        </Button>
                        <Button type="button" size="sm" onClick={() => void saveBooking()} disabled={!canSaveBooking}>
                            {savingBooking ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                            Save booking
                        </Button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
