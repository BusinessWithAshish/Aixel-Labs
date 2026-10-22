'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import {
    listMyCampaigns,
    setVoiceCampaignStatus,
    type VoiceCampaignAction,
    type VoiceCampaignListItem,
} from '@/app/actions/voice-campaign-actions';
import { CAMPAIGN_ACTION_DONE } from '../_utils/campaign-format';

export type CampaignsPageData = {
    campaigns: VoiceCampaignListItem[];
    loadError: string | null;
};

/** While a campaign runs, its progress refreshes on its own. */
const REFRESH_MS = 8000;

export function useCampaignsPage(data: CampaignsPageData) {
    const [campaigns, setCampaigns] = useState(data.campaigns);
    const [busy, setBusy] = useState<{ id: string; action: VoiceCampaignAction } | null>(null);
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

    /** Start, pause or resume from the card; the updated campaign replaces its card. */
    const runAction = useCallback(async (id: string, action: VoiceCampaignAction) => {
        setBusy({ id, action });
        const res = await setVoiceCampaignStatus(id, action);
        setBusy(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Something went wrong');
            return;
        }
        const updated = res.data;
        setCampaigns((list) => list.map((c) => (c.id === id ? updated : c)));
        toast.success(CAMPAIGN_ACTION_DONE[action]);
    }, []);

    return { campaigns, loadError: data.loadError, busy, runAction };
}

export type UseCampaignsPageReturn = ReturnType<typeof useCampaignsPage>;
