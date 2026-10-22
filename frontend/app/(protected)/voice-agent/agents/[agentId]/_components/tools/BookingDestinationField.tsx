'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { VoiceCalendarConnectionStatus } from '@aixellabs/backend/db/types';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { VOICE_CALENDAR_PROVIDERS, voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { bookingCalendarLabel } from '../../_utils/prompt-tools';
import { ConnectedAppsList } from './ConnectedAppsList';

const BUILTIN = 'builtin';
/** A saved destination whose connection is gone or needs connecting again. */
const MISSING = 'missing';
/** "connect:<provider>": leaves for Composio's sign-in page to connect that app. */
const CONNECT = 'connect:';
/** CRMs the agent will write to next (not connectable yet). */
const CRM_LOGOS = ['highlevel', 'hubspot', 'salesforce'];

/**
 * "Where bookings go": the built-in calendar, or one of the owner's connected apps and which
 * calendar (event type) in it, or a new app to connect. The hours, length and timezone still
 * decide what is offered; the app's free/busy is checked on top.
 */
export function BookingDestinationField() {
    const {
        booking,
        savingBooking,
        connectedAppsConfigured,
        connections,
        connecting,
        connectApp,
        activeConnections,
        calendars,
        calendarsLoading,
        calendarsError,
        loadCalendars,
        chooseBookingTarget,
        chooseBookingCalendar,
    } = usePage<UseVoiceAgentEditorPageReturn>();

    const destination = booking.destination;
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
                        onValueChange={(v) =>
                            void (v.startsWith(CONNECT) ? connectApp(v.slice(CONNECT.length)) : chooseBookingTarget(v))
                        }
                        disabled={savingBooking || !!calendarsLoading || !!connecting}
                    >
                        <SelectTrigger
                            id="booking-destination"
                            className="w-full min-w-0 *:data-[slot=select-value]:min-w-0"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={BUILTIN}>{bookingCalendarLabel(null)}</SelectItem>
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
                            {connectedAppsConfigured ? (
                                <>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>
                                            Connect an app (you sign in on Composio&apos;s secure page)
                                        </SelectLabel>
                                        {VOICE_CALENDAR_PROVIDERS.map((p) => (
                                            <SelectItem key={p.provider} value={`${CONNECT}${p.provider}`}>
                                                <CalendarProviderLogo provider={p.provider} className="size-4" />
                                                <span className="grid min-w-0">
                                                    {/* A second account of an app it already has (another calendar owner, say). */}
                                                    {connections.some(
                                                        (c) =>
                                                            c.provider === p.provider &&
                                                            c.status === VoiceCalendarConnectionStatus.ACTIVE,
                                                    )
                                                        ? `Connect another ${p.label} account`
                                                        : `Connect ${p.label}`}
                                                    <span className="text-muted-foreground text-xs">{p.blurb}</span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="crm" disabled data-testid="connect-crm-soon">
                                            <span className="flex shrink-0 gap-1">
                                                {CRM_LOGOS.map((name) => (
                                                    <Image
                                                        key={name}
                                                        src={`/brand-logos/${name}.svg`}
                                                        alt=""
                                                        width={16}
                                                        height={16}
                                                        className="size-4 object-contain"
                                                    />
                                                ))}
                                            </span>
                                            Your own CRM: coming soon
                                        </SelectItem>
                                    </SelectGroup>
                                </>
                            ) : null}
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
            {connecting ? (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader2 className="size-3 animate-spin" />
                    Opening {VOICE_CALENDAR_PROVIDERS.find((p) => p.provider === connecting)?.label}…
                </p>
            ) : null}
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
                    : connectedAppsConfigured
                      ? `${bookingCalendarLabel(null)}: bookings stay in Aixel Labs. Or pick an app to book into your own calendar.`
                      : 'Bookings stay in Aixel Labs. Connecting your own calendar is not switched on for this workspace yet.'}
            </p>
            <ConnectedAppsList />
        </div>
    );
}
