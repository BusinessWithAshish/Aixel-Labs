import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceCampaign } from '@/app/actions/voice-campaign-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useCampaignDetailPage } from './_hooks/use-campaign-detail-page';
import { CampaignDetail } from './_components/CampaignDetail';

async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
    const { campaignId } = await params;
    if (!isValidObjectId(campaignId)) notFound();
    const res = await getVoiceCampaign(campaignId);
    if (!res.success || !res.data) notFound();

    return (
        <PageLayout title={res.data.campaign.name} className="flex flex-col gap-4 p-1">
            <PageProvider data={res.data} usePageHook={useCampaignDetailPage}>
                <CampaignDetail />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(CampaignDetailPage);
