'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import {
    deleteVoiceCampaign,
    getVoiceCampaign,
    setVoiceCampaignStatus,
    type VoiceCampaignAction,
    type VoiceCampaignContactFilter,
    type VoiceCampaignDetail,
} from '@/app/actions/voice-campaign-actions';
import { CAMPAIGNS_URL } from '@/helpers/voice-routes';
import { CAMPAIGN_ACTION_DONE } from '../../_utils/campaign-format';

/** While it runs, the page follows the engine's progress on its own. */
const REFRESH_MS = 4000;

export function useCampaignDetailPage(data: VoiceCampaignDetail) {
    const router = useRouter();
    const [detail, setDetail] = useState(data);
    const [filter, setFilterState] = useState<VoiceCampaignContactFilter>('all');
    const [loadingFilter, setLoadingFilter] = useState(false);
    const [busy, setBusy] = useState<VoiceCampaignAction | 'delete' | null>(null);
    const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
    const filterRef = useRef(filter);

    useEffect(() => setDetail(data), [data]);

    const refresh = useCallback(
        async (next: VoiceCampaignContactFilter = filterRef.current) => {
            const res = await getVoiceCampaign(data.campaign.id, next);
            if (res.success && res.data && filterRef.current === next) setDetail(res.data);
            return res;
        },
        [data.campaign.id],
    );

    const { campaign } = detail;
    const live = campaign.status === VoiceCampaignStatus.RUNNING || campaign.stats.calling > 0;
    useEffect(() => {
        if (!live) return;
        const timer = setInterval(() => void refresh(), REFRESH_MS);
        return () => clearInterval(timer);
    }, [live, refresh]);

    const setFilter = async (next: VoiceCampaignContactFilter) => {
        filterRef.current = next;
        setFilterState(next);
        setLoadingFilter(true);
        const res = await refresh(next);
        setLoadingFilter(false);
        if (!res.success) toast.error(res.error ?? 'Could not load the contacts');
    };

    const runAction = async (action: VoiceCampaignAction) => {
        setBusy(action);
        const res = await setVoiceCampaignStatus(campaign.id, action);
        setBusy(null);
        setConfirm(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Something went wrong');
            return;
        }
        setDetail((d) => ({ ...d, campaign: res.data! }));
        toast.success(CAMPAIGN_ACTION_DONE[action]);
        void refresh();
    };

    const remove = async () => {
        setBusy('delete');
        const res = await deleteVoiceCampaign(campaign.id);
        setBusy(null);
        if (!res.success) {
            setConfirm(null);
            toast.error(res.error ?? 'Could not delete the campaign');
            return;
        }
        toast.success(`Deleted ${campaign.name}`);
        router.push(CAMPAIGNS_URL);
    };

    return {
        campaign,
        contacts: detail.contacts,
        matching: detail.matching,
        filter,
        setFilter,
        loadingFilter,
        busy,
        runAction,
        confirm,
        setConfirm,
        remove,
    };
}

export type UseCampaignDetailPageReturn = ReturnType<typeof useCampaignDetailPage>;
