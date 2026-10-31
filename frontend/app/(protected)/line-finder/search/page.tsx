import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listLineFinderPeople } from '@/app/actions/line-finder-actions';
import { getAppSession } from '@/server/auth';
import { useLineSearchPage } from './_hooks/use-line-search-page';
import { LineSearch } from './_components/LineSearch';

/** The speaker check can take a while. */
export const maxDuration = 60;

/** Pick a person, type a line, get the exact moment on YouTube or a plain "not found". */
async function LineFinderSearchPage() {
    const [people, session] = await Promise.all([listLineFinderPeople(), getAppSession()]);

    return (
        <PageLayout title="Find a line" headerEnd={null}>
            <PageProvider data={{ people: people.data ?? [], isAdmin: !!session?.user?.isAdmin }} usePageHook={useLineSearchPage}>
                <LineSearch />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(LineFinderSearchPage);
