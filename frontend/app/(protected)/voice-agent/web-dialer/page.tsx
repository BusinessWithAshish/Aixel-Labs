import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listWebPhoneNumbers } from '@/app/actions/voice-web-phone-actions';
import { useWebDialerPage } from './_hooks/use-web-dialer-page';
import { WebDialerContent } from './_components/WebDialerContent';
import { WebDialerSkeleton } from './_components/WebDialerSkeleton';

const PAGE_TITLE = 'Web dialer';

/** The numbers come from the database with the page (no provider calls); the browser signs in only once a number is dialled. */
async function WebDialerPage() {
    const res = await listWebPhoneNumbers();

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    numbers: res.success && res.data ? res.data : [],
                    loadError: res.success ? null : (res.error ?? 'Could not load your numbers'),
                }}
                usePageHook={useWebDialerPage}
            >
                <WebDialerContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(WebDialerPage, {
    loadingFallback: (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <WebDialerSkeleton />
        </PageLayout>
    ),
});
