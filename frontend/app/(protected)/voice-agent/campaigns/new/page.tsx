import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceCampaignSetup } from '@/app/actions/voice-campaign-actions';
import { useNewCampaignPage } from './_hooks/use-new-campaign-page';
import { NewCampaignWizard } from './_components/NewCampaignWizard';

const PAGE_TITLE = 'New campaign';

async function NewCampaignPage() {
    const res = await getVoiceCampaignSetup();

    return (
        <PageLayout title={PAGE_TITLE}>
            <PageProvider
                data={{
                    setup: res.success && res.data ? res.data : { agents: [], numbers: [] },
                    loadError: res.success ? null : (res.error ?? 'Could not load your agents and numbers'),
                }}
                usePageHook={useNewCampaignPage}
            >
                <NewCampaignWizard />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(NewCampaignPage);
