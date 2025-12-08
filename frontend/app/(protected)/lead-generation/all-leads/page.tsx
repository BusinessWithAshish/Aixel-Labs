import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { AllUserLeads } from './_components/AllUserLeads';
import { useAllLeadsPage } from './_hooks';
import { getUserLeadsAction } from '@/app/actions/lead-actions';
import type { Lead } from '@aixellabs/shared/mongodb';

const PAGE_TITLE = 'Saved Leads';

async function SavedLeadsPage() {
    const result = await getUserLeadsAction();
    const leads: Lead[] = result.success && result.data ? result.data : [];

    return (
        <PageProvider data={leads} usePageHook={useAllLeadsPage}>
            <PageLayout title={PAGE_TITLE}>
                <AllUserLeads />
            </PageLayout>
        </PageProvider>
    );
}

export default SavedLeadsPage;
