import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getInboxThread, listInboxThreads } from '@/app/actions/voice-inbox-actions';
import { useInboxPage } from './_hooks/use-inbox-page';
import { InboxContent } from './_components/InboxContent';

const PAGE_TITLE = 'WhatsApp Inbox';

async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
    const { c } = await searchParams;
    const selectedKey = typeof c === 'string' && c ? c : null;
    const [threadsRes, threadRes] = await Promise.all([
        listInboxThreads(),
        selectedKey ? getInboxThread(selectedKey) : Promise.resolve(null),
    ]);

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    threads: threadsRes.success && threadsRes.data ? threadsRes.data : [],
                    selectedKey: threadRes?.success ? selectedKey : null,
                    thread: threadRes?.success && threadRes.data ? threadRes.data : null,
                    loadError: threadsRes.success ? null : (threadsRes.error ?? 'Could not load your WhatsApp conversations'),
                }}
                usePageHook={useInboxPage}
            >
                <InboxContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(InboxPage);
