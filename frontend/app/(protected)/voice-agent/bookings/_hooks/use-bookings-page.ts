'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { cancelBooking, type MyBookings, type VoiceBookingListItem } from '@/app/actions/voice-booking-actions';
import { browserTimezone } from '@/helpers/voice-time';
import { formatSlotIn } from '../_utils/booking-format';

export type BookingsPageData = {
    bookings: MyBookings;
    agents: VoiceAgentOption[];
    agentFilter: string | null;
    loadError: string | null;
};

export function useBookingsPage(data: BookingsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();
    const [bookings, setBookings] = useState<MyBookings>(data.bookings);
    const [cancelTarget, setCancelTarget] = useState<VoiceBookingListItem | null>(null);
    const [cancelling, setCancelling] = useState(false);
    /** The viewer's own zone, known only in the browser (the server renders without it). */
    const [viewerTimeZone, setViewerTimeZone] = useState<string | null>(null);

    useEffect(() => setBookings(data.bookings), [data.bookings]);
    useEffect(() => setViewerTimeZone(browserTimezone()), []);

    /** The filter lives in the URL (`?agent=`), like Call logs. */
    const setAgentFilter = (agentId: string | null) => {
        startFiltering(() => {
            router.push(agentId ? `${pathname}?agent=${agentId}` : pathname);
        });
    };

    const agentFilterName = data.agentFilter
        ? (data.agents.find((a) => a.id === data.agentFilter)?.name ?? 'Deleted agent')
        : null;

    const confirmCancel = async () => {
        const target = cancelTarget;
        if (!target?._id) return;
        setCancelling(true);
        const res = await cancelBooking(target._id);
        setCancelling(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not cancel the booking');
            return;
        }
        const updated = res.data;
        const replace = (list: VoiceBookingListItem[]) => list.map((b) => (b._id === updated._id ? updated : b));
        setBookings((prev) => ({ upcoming: replace(prev.upcoming), past: replace(prev.past) }));
        toast.success(
            `Cancelled ${target.customerName}’s booking on ${formatSlotIn(target.start, target.end, target.timezone)}`,
        );
        setCancelTarget(null);
    };

    return {
        upcoming: bookings.upcoming,
        past: bookings.past,
        agents: data.agents,
        agentFilter: data.agentFilter,
        agentFilterName,
        loadError: data.loadError,
        filtering,
        setAgentFilter,
        viewerTimeZone,
        cancelTarget,
        setCancelTarget,
        cancelling,
        confirmCancel,
    };
}

export type UseBookingsPageReturn = ReturnType<typeof useBookingsPage>;
