'use client';

import { VoiceProvider } from '@aixellabs/backend/db/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

const PROVIDER_LABEL: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]: 'Telnyx',
    [VoiceProvider.TWILIO]: 'Twilio',
    [VoiceProvider.VOICELINK]: 'VoiceLink',
};

export function StepDetails() {
    const { name, setName, agents, agentId, setAgentId, numbers, numberId, setNumberId } =
        usePage<UseNewCampaignPageReturn>();

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input
                    id="campaign-name"
                    value={name}
                    maxLength={80}
                    placeholder="e.g. October cleaning reminders"
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="campaign-agent">Agent that calls</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                    <SelectTrigger id="campaign-agent" className="w-full">
                        <SelectValue placeholder="Pick an outbound agent" />
                    </SelectTrigger>
                    <SelectContent>
                        {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">Only outbound agents can place calls.</p>
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="campaign-number">Call from</Label>
                <Select value={numberId} onValueChange={setNumberId}>
                    <SelectTrigger id="campaign-number" className="w-full">
                        <SelectValue placeholder="Pick one of your numbers" />
                    </SelectTrigger>
                    <SelectContent>
                        {numbers.map((number) => (
                            <SelectItem key={number.id} value={number.id}>
                                <span className="tabular-nums">{number.phoneNumber}</span>
                                <span className="text-muted-foreground">· {PROVIDER_LABEL[number.provider]}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">Every call shows this number to the person called.</p>
            </div>
        </div>
    );
}
