import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyCampaigns } from '@/app/actions/voice-campaign-actions';
import { useCampaignsPage } from './_hooks/use-campaigns-page';
import { CampaignsContent } from './_components/CampaignsContent';

const PAGE_TITLE = 'Campaigns';

async function CampaignsPage() {
    const res = await listMyCampaigns();

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    campaigns: res.success && res.data ? res.data : [],
                    loadError: res.success ? null : (res.error ?? 'Could not load your campaigns'),
                }}
                usePageHook={useCampaignsPage}
            >
                <CampaignsContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(CampaignsPage);
