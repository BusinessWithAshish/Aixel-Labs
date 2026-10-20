import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyBookings } from '@/app/actions/voice-booking-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useBookingsPage } from './_hooks/use-bookings-page';
import { BookingsContent } from './_components/BookingsContent';

const PAGE_TITLE = 'Bookings';

async function BookingsPage({ searchParams }: { searchParams: Promise<{ agent?: string | string[] }> }) {
    const { agent } = await searchParams;
    const agentFilter = typeof agent === 'string' && isValidObjectId(agent) ? agent : null;

    const [bookingsRes, agentsRes] = await Promise.all([listMyBookings({ agentId: agentFilter }), getVoiceAgentOptions()]);

    return (
        <PageLayout title={PAGE_TITLE}>
            <PageProvider
                data={{
                    bookings: bookingsRes.success && bookingsRes.data ? bookingsRes.data : { upcoming: [], past: [] },
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    agentFilter,
                    loadError: bookingsRes.success ? null : (bookingsRes.error ?? 'Could not load your bookings'),
                }}
                usePageHook={useBookingsPage}
            >
                <BookingsContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(BookingsPage);
