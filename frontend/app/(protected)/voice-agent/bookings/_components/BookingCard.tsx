'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CalendarCheck, Phone, StickyNote, Video } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceBookingStatus } from '@aixellabs/backend/db/types';
import type { VoiceBookingListItem } from '@/app/actions/voice-booking-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SubModuleUrls } from '@/config/app-config';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { cn } from '@/lib/utils';
import { channelLabel, formatSlotIn, zoneLabel } from '../_utils/booking-format';

const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

type BookingCardProps = {
    booking: VoiceBookingListItem;
    upcoming: boolean;
    viewerTimeZone: string | null;
    onCancel: (booking: VoiceBookingListItem) => void;
};

function StatusBadge({ booking, upcoming }: { booking: VoiceBookingListItem; upcoming: boolean }) {
    if (booking.status === VoiceBookingStatus.CANCELLED) return <Badge variant="red">Cancelled</Badge>;
    return <Badge variant={upcoming ? 'green' : 'secondary'}>{upcoming ? 'Booked' : 'Done'}</Badge>;
}

export function BookingCard({ booking, upcoming, viewerTimeZone, onCancel }: BookingCardProps) {
    const cancelled = booking.status === VoiceBookingStatus.CANCELLED;
    const slot = formatSlotIn(booking.start, booking.end, booking.timezone);
    // The viewer's clock only when it reads differently from the booking's own.
    const viewerSlot = viewerTimeZone ? formatSlotIn(booking.start, booking.end, viewerTimeZone) : null;
    const showViewer = !!viewerSlot && viewerSlot !== slot;

    return (
        <li
            id={booking._id ? `booking-${booking._id}` : undefined}
            data-testid="booking"
            data-status={booking.status}
            className={cn(
                'bg-card flex scroll-mt-4 flex-col gap-3 rounded-lg border p-3 text-sm transition-shadow sm:p-4',
                'target:ring-primary target:ring-2',
                cancelled && 'opacity-70',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                        className={cn('font-semibold tabular-nums', cancelled && 'line-through')}
                        data-testid="booking-slot"
                    >
                        {slot}
                    </span>
                    <span className="text-muted-foreground text-xs" data-testid="booking-zone">
                        {zoneLabel(booking.timezone)}
                        {showViewer ? (
                            <>
                                {' · '}
                                <span data-testid="booking-viewer-time">Your time: {viewerSlot}</span>
                            </>
                        ) : null}
                    </span>
                </div>
                <StatusBadge booking={booking} upcoming={upcoming} />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium break-words" data-testid="booking-customer">
                    {booking.customerName || 'No name given'}
                </span>
                {booking.customerPhone ? (
                    <a
                        href={`tel:${booking.customerPhone}`}
                        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 tabular-nums"
                    >
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        {booking.customerPhone}
                    </a>
                ) : null}
                {booking.external ? (
                    <span
                        className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm"
                        data-testid="booking-external"
                    >
                        <CalendarCheck className="size-3.5 shrink-0" />
                        <span className="min-w-0">In {voiceCalendarProviderLabel(booking.external.provider)}</span>
                        {booking.external.meetingUrl && !cancelled ? (
                            <a
                                href={booking.external.meetingUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                            >
                                <Video className="size-3.5" />
                                Meeting link
                            </a>
                        ) : null}
                    </span>
                ) : null}
                {booking.notes ? (
                    <p className="text-muted-foreground flex items-start gap-1.5 break-words whitespace-pre-wrap">
                        <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0">{booking.notes}</span>
                    </p>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1">
                        <Bot className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{booking.agentName ?? 'Deleted agent'}</span>
                    </span>
                    <span>{channelLabel(booking.channel)}</span>
                    {booking.callId ? (
                        <Link
                            href={`${CALL_LOGS_URL}/${booking.callId}`}
                            className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                            data-testid="booking-call-link"
                        >
                            View call
                            <ArrowRight className="size-3" aria-hidden />
                        </Link>
                    ) : null}
                </div>
                {upcoming && !cancelled ? (
                    <Button variant="outline" size="sm" onClick={() => onCancel(booking)}>
                        Cancel booking
                    </Button>
                ) : null}
            </div>
        </li>
    );
}
