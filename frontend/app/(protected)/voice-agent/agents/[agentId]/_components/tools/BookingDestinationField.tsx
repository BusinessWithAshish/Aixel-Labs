'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

const BUILTIN = 'builtin';
/** A saved destination whose connection is gone or needs connecting again. */
const MISSING = 'missing';

/**
 * "Where bookings go": the built-in calendar, or one of the owner's connected apps and which
 * calendar (event type) in it. The hours, length and timezone still decide what is offered;
 * the app's free/busy is checked on top.
 */
export function BookingDestinationField() {
    const {
        bookingDraft,
        savingBooking,
        activeConnections,
        calendars,
        calendarsLoading,
        calendarsError,
        loadCalendars,
        chooseBookingTarget,
        chooseBookingCalendar,
    } = usePage<UseVoiceAgentEditorPageReturn>();

    const destination = bookingDraft.destination;
    const connection = destination
        ? activeConnections.find((c) => c.connectedAccountId === destination.connectedAccountId)
        : undefined;
    const target = connection?._id ?? (destination ? MISSING : BUILTIN);
    const list = connection ? calendars[connection._id ?? ''] : undefined;
    const info = destination ? voiceCalendarProviderInfo(destination.provider) : null;
    const loading = !!connection && calendarsLoading === connection._id;
    // A saved calendar is shown even before (or without) the list loading; none yet = the owner picks.
    const options =
        list ??
        (destination?.calendarId
            ? [{ id: destination.calendarId, name: destination.calendarName, primary: false, detail: null }]
            : []);
    const withSaved =
        destination?.calendarId && !options.some((c) => c.id === destination.calendarId)
            ? [...options, { id: destination.calendarId, name: destination.calendarName, primary: false, detail: null }]
            : options;

    useEffect(() => {
        if (connection && !list && calendarsLoading !== connection._id) void loadCalendars(connection);
        // Load the saved connection's calendars once it is known.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection?._id]);

    return (
        <div className="grid gap-2" data-testid="booking-destination">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="booking-destination">Where bookings go</Label>
                    <Select
                        value={target}
                        onValueChange={(v) => void chooseBookingTarget(v)}
                        disabled={savingBooking || !!calendarsLoading}
                    >
                        <SelectTrigger
                            id="booking-destination"
                            className="w-full min-w-0 *:data-[slot=select-value]:min-w-0"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={BUILTIN}>Built-in calendar</SelectItem>
                            {destination && !connection ? (
                                <SelectItem value={MISSING} disabled>
                                    <CalendarProviderLogo provider={destination.provider} className="size-4" />
                                    {info?.label} (needs connecting again)
                                </SelectItem>
                            ) : null}
                            {activeConnections.map((c) => (
                                <SelectItem key={c._id} value={c._id ?? ''}>
                                    <CalendarProviderLogo provider={c.provider} className="size-4" />
                                    <span className="min-w-0 truncate">
                                        {voiceCalendarProviderInfo(c.provider).label}
                                        {c.label ? ` (${c.label})` : ''}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {destination && info && connection ? (
                    <div className="grid min-w-0 gap-2">
                        <Label htmlFor="booking-calendar">{info.targetNoun}</Label>
                        <Select
                            value={destination.calendarId}
                            onValueChange={chooseBookingCalendar}
                            disabled={savingBooking || loading}
                        >
                            <SelectTrigger id="booking-calendar" className="w-full">
                                {loading ? (
                                    <span className="text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="size-4 animate-spin" />
                                        Loading…
                                    </span>
                                ) : (
                                    <SelectValue
                                        placeholder={
                                            info.targetNoun === 'Calendar' ? 'Choose a calendar' : 'Choose an event type'
                                        }
                                    />
                                )}
                            </SelectTrigger>
                            <SelectContent>
                                {withSaved.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                        {c.detail ? <span className="text-muted-foreground"> · {c.detail}</span> : null}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
            </div>
            {calendarsLoading && !destination ? (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader2 className="size-3 animate-spin" />
                    Loading calendars…
                </p>
            ) : null}
            {destination && !connection ? (
                <p className="text-destructive text-sm" role="alert" data-testid="booking-destination-missing">
                    This agent books into {info?.label ?? 'an app'} ({destination.calendarName}), which needs connecting
                    again. Until then she can&apos;t check times and offers to take a message.
                </p>
            ) : null}
            {calendarsError ? (
                <p className="text-destructive text-sm" role="alert" data-testid="booking-destination-error">
                    {calendarsError}
                </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
                {destination && info
                    ? `The agent checks your ${info.label} for busy times, books there, and lists each booking in Bookings too.` +
                      (info.targetNoun === 'Event type' ? ' Callers are asked for an email address.' : '')
                    : activeConnections.length > 0
                      ? 'Bookings stay in Aixel Labs. Pick a connected app to book into your own calendar instead.'
                      : 'Bookings stay in Aixel Labs. Connect an app below to book into your own calendar instead.'}
            </p>
        </div>
    );
}
