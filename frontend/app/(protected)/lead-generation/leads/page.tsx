import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { AllUserLeads } from '@/app/(protected)/lead-generation/_components/AllUserLeads';
import { getAllUserLeads } from '@/app/actions/user-lead-actions';
import { PageProvider } from '@/contexts/PageStore';
import type { Lead } from '@aixellabs/backend/db/types';
import { useAllLeadsPage } from '@/app/(protected)/lead-generation/_hooks';

const PAGE_TITLE = 'All Leads';

async function SavedLeadsPage() {
    const result = await getAllUserLeads();
    const leads: Lead[] = result.success && result.data ? result.data : [];

    return (
        <PageProvider data={leads} usePageHook={useAllLeadsPage}>
            <PageLayout title={PAGE_TITLE}>
                <AllUserLeads />
            </PageLayout>
        </PageProvider>
    );
}

export default withPageHandler(SavedLeadsPage);
