import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import type { UserLeadList } from '@aixellabs/backend/db/types';
import { useUserLeadListsPage } from '@/app/(protected)/lead-generation/leads/_hooks/use-user-lead-lists-page';
import { UserLeadLists } from './_components/UserLeadLists';
import { getUserLeadLists } from '@/app/actions/user-lead-lists-actions';

const PAGE_TITLE = 'Leads list';

async function SavedLeadsPage() {
    const userLeadLists = await getUserLeadLists();
    const userLeadListsData: UserLeadList[] = userLeadLists.success && userLeadLists.data ? userLeadLists.data : [];

    return (
        <PageLayout title={PAGE_TITLE}>
            <PageProvider data={userLeadListsData} usePageHook={useUserLeadListsPage}>
                <UserLeadLists />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(SavedLeadsPage);
