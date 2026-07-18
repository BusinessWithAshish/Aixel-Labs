import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { AllUserLeads } from './_components/AllUserLeads';
import { getUserLeadsForList } from '@/app/actions/user-lead-actions';
import { PageProvider } from '@/contexts/PageStore';
import { useAllLeadsPage } from '@/app/(protected)/lead-generation/leads/_hooks/use-list-leads';
import { notFound } from 'next/navigation';
import { getUserLeadListById } from '@/app/actions/user-lead-lists-actions';

async function LeadsListPage({ params }: { params: Promise<{ listId: string }> }) {
    const { listId } = await params;

    const userLeadListResponse = await getUserLeadListById(listId);
    if (!userLeadListResponse.success || !userLeadListResponse.data) {
        return notFound();
    }

    const userLeadsResponse = await getUserLeadsForList(listId);
    if (!userLeadsResponse.success) {
        return notFound();
    }

    const list = userLeadListResponse.data;
    const leads = userLeadsResponse.data ?? [];
    const pageTitle = list.name ?? 'Leads';

    return (
        <PageLayout title={pageTitle}>
            <PageProvider data={{ listId, leads }} usePageHook={useAllLeadsPage}>
                <AllUserLeads />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(LeadsListPage);
