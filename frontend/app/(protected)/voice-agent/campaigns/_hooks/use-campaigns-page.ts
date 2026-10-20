'use client';

import { useEffect, useState } from 'react';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import { listMyCampaigns, type VoiceCampaignListItem } from '@/app/actions/voice-campaign-actions';

export type CampaignsPageData = {
    campaigns: VoiceCampaignListItem[];
    loadError: string | null;
};

/** While a campaign runs, its progress refreshes on its own. */
const REFRESH_MS = 8000;

export function useCampaignsPage(data: CampaignsPageData) {
    const [campaigns, setCampaigns] = useState(data.campaigns);
    useEffect(() => setCampaigns(data.campaigns), [data.campaigns]);

    const running = campaigns.some((c) => c.status === VoiceCampaignStatus.RUNNING || c.stats.calling > 0);
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(async () => {
            const res = await listMyCampaigns();
            if (res.success && res.data) setCampaigns(res.data);
        }, REFRESH_MS);
        return () => clearInterval(timer);
    }, [running]);

    return { campaigns, loadError: data.loadError };
}

export type UseCampaignsPageReturn = ReturnType<typeof useCampaignsPage>;
