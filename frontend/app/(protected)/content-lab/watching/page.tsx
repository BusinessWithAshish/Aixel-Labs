import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listContentLabWatches } from '@/app/actions/content-lab-actions';
import { useWatchingPage } from './_hooks/use-watching-page';
import { WatchingList } from './_components/WatchingList';

/** Tracked creators and their latest standout posts. */
async function ContentLabWatchingPage() {
    const response = await listContentLabWatches();

    return (
        <PageLayout title="Watching">
            <PageProvider data={{ watches: response.data ?? [] }} usePageHook={useWatchingPage}>
                <WatchingList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabWatchingPage);
