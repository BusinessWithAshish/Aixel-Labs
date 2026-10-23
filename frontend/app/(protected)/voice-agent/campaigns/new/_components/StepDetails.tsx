'use client';

import { VOICE_CAMPAIGN_LIMITS } from '@aixellabs/backend/db/types';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
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
            <PhoneNumberControlledField
                name="numberId"
                id="campaign-number"
                label="Call from"
                description="Every call shows this number to the person called."
                numbers={numbers}
            />
        </div>
    );
}
