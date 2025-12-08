import PageLayout from '@/components/common/PageLayout';
import { withPageData } from '@/contexts/PageStore';
import { AllUserLeads } from './_components/AllUserLeads';
import { useAllLeadsPage } from './_hooks';
import { getUserLeadsAction } from '@/app/actions/lead-actions';

const PAGE_TITLE = 'Saved Leads';

async function SavedLeadsPage() {
    const result = await getUserLeadsAction();

    return (
        <PageLayout title={PAGE_TITLE}>
            {withPageData({
                dataFetchResult: result,
                usePageHook: useAllLeadsPage,
                loadingText: 'Loading leads...',
                emptyMessage: 'No leads found.',
                children: <AllUserLeads />,
            })}
        </PageLayout>
    );
}

export default SavedLeadsPage;
