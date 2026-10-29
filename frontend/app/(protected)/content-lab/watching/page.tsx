import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getContentLabProfile, listContentLabWatches } from '@/app/actions/content-lab-actions';
import { useWatchingPage } from './_hooks/use-watching-page';
import { WatchingList } from './_components/WatchingList';

/** Tracked creators: who they are, their recent posts and which of those are doing far better than usual. */
async function ContentLabWatchingPage() {
    const [response, profile] = await Promise.all([listContentLabWatches(), getContentLabProfile()]);

    return (
        <PageLayout title="Watching">
            <PageProvider
                data={{ watches: response.data ?? [], country: profile.data?.country ?? CONTENT_LAB_DEFAULT_COUNTRY }}
                usePageHook={useWatchingPage}
            >
                <WatchingList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabWatchingPage);
