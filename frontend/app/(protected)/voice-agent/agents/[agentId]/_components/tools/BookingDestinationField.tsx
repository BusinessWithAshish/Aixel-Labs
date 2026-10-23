'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronRight, Info, Loader2, Plug, TriangleAlert } from 'lucide-react';
import { type VoiceCalendarProvider } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { VOICE_CALENDAR_PROVIDERS, voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { bookingCalendarLabel } from '../../_utils/prompt-tools';
import { BookingCalendarFields, bookingTimesSummary } from './BookingCalendarFields';
import { ConnectedAppsList } from './ConnectedAppsList';

const BUILTIN = 'builtin';
/** CRMs the agent will write to next (not connectable yet). */
const CRM_LOGOS = ['highlevel', 'hubspot', 'salesforce'];

/** A connected app: its account (when there are several) and which calendar or event type bookings go to. */
function AppTarget({ provider }: { provider: VoiceCalendarProvider }) {
    const {
        booking,
        savingBooking,
        activeConnections,
        calendars,
        calendarsLoading,
        loadCalendars,
        chooseBookingTarget,
        chooseBookingCalendar,
    } = usePage<UseVoiceAgentEditorPageReturn>();
    const info = voiceCalendarProviderInfo(provider);
    const accounts = activeConnections.filter((c) => c.provider === provider);
    const destination = booking.destination?.provider === provider ? booking.destination : null;
    const connection = destination
        ? accounts.find((c) => c.connectedAccountId === destination.connectedAccountId)
        : undefined;
    const list = connection ? calendars[connection._id ?? ''] : undefined;
    const loading = !!connection && calendarsLoading === connection._id;
    // The saved calendar is shown before (or without) the list loading; none yet = the owner picks.
    const saved = destination?.calendarId
        ? [{ id: destination.calendarId, name: destination.calendarName, primary: false, detail: null }]
        : [];
    const options = [...(list ?? []), ...saved.filter((c) => !list?.some((l) => l.id === c.id))];

    useEffect(() => {
        if (connection && !list && calendarsLoading !== connection._id) void loadCalendars(connection);
        // Load the chosen account's calendars once it is known.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection?._id]);

    if (!connection) return null;
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {accounts.length > 1 ? (
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="booking-account">Account</Label>
                    <Select
                        value={connection._id}
                        onValueChange={(id) => void chooseBookingTarget(id)}
                        disabled={savingBooking || !!calendarsLoading}
                    >
                        <SelectTrigger id="booking-account" className="bg-background w-full min-w-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map((c) => (
                                <SelectItem key={c._id} value={c._id ?? ''}>
                                    {c.label || info.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="booking-calendar">{info.targetNoun}</Label>
                <Select
                    value={destination?.calendarId ?? ''}
                    onValueChange={chooseBookingCalendar}
                    disabled={savingBooking || loading}
                >
                    <SelectTrigger id="booking-calendar" className="bg-background w-full">
                        {loading ? (
                            <span className="text-muted-foreground flex items-center gap-2">
                                <Loader2 className="size-4 animate-spin" />
                                Loading…
                            </span>
                        ) : (
                            <SelectValue
                                placeholder={info.targetNoun === 'Calendar' ? 'Choose a calendar' : 'Choose an event type'}
                            />
                        )}
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name}
                                {c.detail ? <span className="text-muted-foreground"> · {c.detail}</span> : null}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

/**
 * "Where bookings go": the built-in calendar (its hours, length and timezone below), or one of the owner's
 * booking apps, which shows only that app: connect it, or its connected account and calendar. With an app the
 * owner's hours still bound what is offered (the app's free/busy is checked on top), so they stay one click away.
 */
export function BookingDestinationField() {
    const {
        booking,
        bookingApp,
        chooseBookingApp,
        savingBooking,
        connectedAppsConfigured,
        activeConnections,
        connecting,
        connectApp,
        calendarsLoading,
        calendarsError,
    } = usePage<UseVoiceAgentEditorPageReturn>();
    const [timesOpen, setTimesOpen] = useState(false);

    const destination = booking.destination;
    const app = bookingApp === BUILTIN ? null : voiceCalendarProviderInfo(bookingApp);
    const connected = !!app && activeConnections.some((c) => c.provider === app.provider);
    // Saved into an account that is gone or needs connecting again.
    const lost =
        !!destination &&
        destination.provider === app?.provider &&
        !activeConnections.some((c) => c.connectedAccountId === destination.connectedAccountId);
    const now = bookingCalendarLabel(destination ?? null);

    return (
        <div className="grid gap-4" data-testid="booking-destination">
            <div className="grid min-w-0 gap-2 sm:max-w-sm">
                <Label htmlFor="booking-destination">Where bookings go</Label>
                <Select
                    value={bookingApp}
                    onValueChange={(v) => void chooseBookingApp(v as VoiceCalendarProvider | typeof BUILTIN)}
                    disabled={savingBooking || !!calendarsLoading || !!connecting}
                >
                    <SelectTrigger id="booking-destination" className="bg-background w-full min-w-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={BUILTIN}>{bookingCalendarLabel(null)}</SelectItem>
                        {VOICE_CALENDAR_PROVIDERS.map((p) => (
                            <SelectItem key={p.provider} value={p.provider}>
                                <CalendarProviderLogo provider={p.provider} className="size-4" />
                                {p.label}
                            </SelectItem>
                        ))}
                        <SelectSeparator />
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
                    </SelectContent>
                </Select>
            </div>

            {!app ? (
                <>
                    <p className="text-muted-foreground text-xs">
                        Bookings stay in Aixel Labs. Callers are offered these times, minus the ones already booked.
                    </p>
                    <BookingCalendarFields />
                </>
            ) : (
                <div className="grid gap-3" data-testid={`booking-app-${app.provider}`}>
                    {lost ? (
                        <Alert variant="warning" data-testid="booking-destination-missing">
                            <TriangleAlert className="size-4" />
                            <AlertDescription>
                                This agent books into {app.label} ({destination?.calendarName}), which needs connecting
                                again. Until then it can&apos;t check times and offers to take a message.
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    {!connected ? (
                        <div className="bg-background flex flex-wrap items-center gap-3 rounded-md border p-3">
                            <CalendarProviderLogo provider={app.provider} />
                            <div className="grid min-w-40 flex-1 gap-0.5">
                                <span className="text-sm font-medium">{app.label}</span>
                                <span className="text-muted-foreground text-xs">{app.blurb}</span>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => void connectApp(app.provider)}
                                disabled={!connectedAppsConfigured || !!connecting}
                            >
                                {connecting === app.provider ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Plug className="size-4" />
                                )}
                                Connect {app.label}
                            </Button>
                        </div>
                    ) : (
                        <AppTarget provider={app.provider} />
                    )}
                    {!connectedAppsConfigured ? (
                        <Alert variant="warning">
                            <TriangleAlert className="size-4" />
                            <AlertDescription>
                                Connecting your own calendar is not switched on for this workspace yet. Bookings stay in the
                                built-in calendar.
                            </AlertDescription>
                        </Alert>
                    ) : !connected && !lost ? (
                        <Alert variant="info">
                            <Info className="size-4" />
                            <AlertDescription>
                                You sign in on Composio&apos;s secure page; we never see your password. Your changes are
                                saved first. Until {app.label} is connected, bookings go to {now}.
                            </AlertDescription>
                        </Alert>
                    ) : destination?.provider === app.provider ? (
                        <p className="text-muted-foreground text-xs">
                            The agent checks your {app.label} for busy times, books there, and lists each booking in Bookings
                            too.
                            {app.targetNoun === 'Event type' ? ' Callers are asked for an email address.' : ''}
                        </p>
                    ) : null}
                    {connecting ? (
                        <p className="text-muted-foreground flex items-center gap-2 text-xs">
                            <Loader2 className="size-3 animate-spin" />
                            Saving, then opening {app.label}…
                        </p>
                    ) : null}
                    {calendarsError ? (
                        <Alert variant="warning" data-testid="booking-destination-error">
                            <TriangleAlert className="size-4" />
                            <AlertDescription>{calendarsError}</AlertDescription>
                        </Alert>
                    ) : null}
                    <ConnectedAppsList provider={app.provider} />
                    {connected && connectedAppsConfigured ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto justify-self-start p-0"
                            onClick={() => void connectApp(app.provider)}
                            disabled={!!connecting}
                        >
                            Connect another {app.label} account
                        </Button>
                    ) : null}
                    <Collapsible open={timesOpen} onOpenChange={setTimesOpen} className="grid gap-3">
                        <CollapsibleTrigger className="group/times text-muted-foreground hover:text-foreground flex items-start gap-1.5 text-left text-xs">
                            <ChevronRight className="mt-px size-3.5 shrink-0 transition-transform group-data-[state=open]/times:rotate-90" />
                            <span>
                                Times the agent offers, within your {app.label}&apos;s free time:{' '}
                                {bookingTimesSummary(booking)}
                            </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <BookingCalendarFields />
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            )}
        </div>
    );
}
