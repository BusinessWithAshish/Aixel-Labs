'use client';

import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceBookingStatus } from '@aixellabs/backend/db/types';
import type { VoiceBookingListItem } from '@/app/actions/voice-booking-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseBookingsPageReturn } from '../_hooks/use-bookings-page';
import { formatSlotIn } from '../_utils/booking-format';
import { BookingCard } from './BookingCard';

const ALL_AGENTS = 'all';
const AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

function BookingSection({
    title,
    bookings,
    upcoming,
    emptyText,
}: {
    title: string;
    bookings: VoiceBookingListItem[];
    upcoming: boolean;
    emptyText: string;
}) {
    const { viewerTimeZone, setCancelTarget } = usePage<UseBookingsPageReturn>();
    const headingId = upcoming ? 'bookings-upcoming' : 'bookings-past';

    return (
        <section className="flex flex-col gap-2" aria-labelledby={headingId}>
            <h2 id={headingId} className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {title} <span className="tabular-nums">({bookings.length})</span>
            </h2>
            {bookings.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">{emptyText}</p>
            ) : (
                <ul className="flex flex-col gap-2" aria-label={title} data-testid={headingId}>
                    {bookings.map((booking) => (
                        <BookingCard
                            key={booking._id}
                            booking={booking}
                            upcoming={upcoming}
                            viewerTimeZone={viewerTimeZone}
                            onCancel={setCancelTarget}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

export function BookingsContent() {
    const {
        upcoming,
        past,
        agents,
        agentFilter,
        agentFilterName,
        loadError,
        filtering,
        setAgentFilter,
        cancelTarget,
        setCancelTarget,
        cancelling,
        confirmCancel,
    } = usePage<UseBookingsPageReturn>();
    const total = upcoming.length + past.length;
    const scheduled = upcoming.filter((b) => b.status === VoiceBookingStatus.BOOKED).length;

    return (
        <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-muted-foreground max-w-prose text-sm">
                    {total === 0
                        ? 'Appointments your agents book during calls.'
                        : `${scheduled} upcoming ${scheduled === 1 ? 'appointment' : 'appointments'}${agentFilterName ? ` with ${agentFilterName}` : ''}. Times are shown in the agent’s booking timezone.`}
                </p>
                <div className="flex w-full flex-col gap-1.5 sm:w-60">
                    <Label htmlFor="bookings-agent-filter">Agent</Label>
                    <Select
                        value={agentFilter ?? ALL_AGENTS}
                        disabled={filtering}
                        onValueChange={(value) => setAgentFilter(value === ALL_AGENTS ? null : value)}
                    >
                        <SelectTrigger id="bookings-agent-filter" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_AGENTS}>All agents</SelectItem>
                            {agentFilter && !agents.some((a) => a.id === agentFilter) ? (
                                <SelectItem value={agentFilter}>Deleted agent</SelectItem>
                            ) : null}
                            {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {total === 0 && !loadError ? (
                <EmptyState
                    icon={<CalendarCheck />}
                    title="No bookings yet"
                    description={
                        agentFilter
                            ? 'This agent has not booked anything yet. Turn on its booking tools (check_availability, book_appointment), and every time a caller books a slot it shows up here.'
                            : 'Turn on the booking tools in an agent’s Tools and set your opening hours. When a caller picks a time, the agent books it and it shows up here.'
                    }
                    data-testid="bookings-empty"
                >
                    <Button asChild variant="outline" size="sm">
                        <Link href={agentFilter ? `${AGENTS_URL}/${agentFilter}` : AGENTS_URL}>
                            {agentFilter ? 'Open this agent' : 'Open agents'}
                        </Link>
                    </Button>
                </EmptyState>
            ) : null}

            {total > 0 ? (
                <div className={cn('flex flex-col gap-6 transition-opacity', filtering && 'opacity-60')}>
                    <BookingSection title="Upcoming" bookings={upcoming} upcoming emptyText="Nothing booked from now on." />
                    {past.length > 0 ? <BookingSection title="Past" bookings={past} upcoming={false} emptyText="" /> : null}
                </div>
            ) : null}

            <ConfirmDialog
                open={cancelTarget !== null}
                onOpenChange={(open) => !open && !cancelling && setCancelTarget(null)}
                title="Cancel this booking?"
                description={
                    cancelTarget
                        ? `${cancelTarget.customerName || 'The caller'} · ${formatSlotIn(cancelTarget.start, cancelTarget.end, cancelTarget.timezone)}`
                        : undefined
                }
                alertMessage="The slot opens up again for your agent to offer. We do not tell the customer, so let them know yourself."
                onConfirm={() => void confirmCancel()}
                isLoading={cancelling}
                confirmText="Cancel booking"
                cancelText="Keep it"
            />
        </>
    );
}
