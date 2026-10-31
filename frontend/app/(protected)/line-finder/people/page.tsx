import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listLineFinderPeople } from '@/app/actions/line-finder-actions';
import { getAppSession } from '@/server/auth';
import { useLinePeoplePage } from './_hooks/use-line-people-page';
import { LinePeople } from './_components/LinePeople';

/** Who is searchable, and how collecting their videos is going. Changing the list is for admins. */
async function LineFinderPeoplePage() {
    const [people, session] = await Promise.all([listLineFinderPeople(), getAppSession()]);

    return (
        <PageLayout title="People" headerEnd={null}>
            <PageProvider data={{ people: people.data ?? [], isAdmin: !!session?.user?.isAdmin }} usePageHook={useLinePeoplePage}>
                <LinePeople />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(LineFinderPeoplePage);
