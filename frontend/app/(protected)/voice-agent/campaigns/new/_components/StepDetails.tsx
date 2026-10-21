'use client';

import { VOICE_CAMPAIGN_LIMITS } from '@aixellabs/backend/db/types';
import { SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

export function StepDetails() {
    const { agents, numbers } = usePage<UseNewCampaignPageReturn>();

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <StringControlledField
                name="name"
                id="campaign-name"
                label="Campaign name"
                placeholder="e.g. October cleaning reminders"
                className="sm:col-span-2"
                inputProps={{ maxLength: VOICE_CAMPAIGN_LIMITS.nameMax }}
            />
            <SelectControlledField
                name="agentId"
                id="campaign-agent"
                label="Agent that calls"
                placeholder="Pick an outbound agent"
                description="Only outbound agents can place calls."
                classNames={{ description: 'text-xs' }}
                options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
            />
            <SelectControlledField
                name="numberId"
                id="campaign-number"
                label="Call from"
                placeholder="Pick one of your numbers"
                description="Every call shows this number to the person called."
                classNames={{ description: 'text-xs' }}
                options={numbers.map((number) => ({
                    value: number.id,
                    label: `${number.phoneNumber} · ${numberProviderInfo(number.provider).label}`,
                }))}
            />
        </div>
    );
}
