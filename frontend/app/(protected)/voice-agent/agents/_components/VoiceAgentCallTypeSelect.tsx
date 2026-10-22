'use client';

import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICE_AGENT_CALL_TYPE_ORDER, VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';

type VoiceAgentCallTypeSelectProps = {
    id?: string;
    value: VoiceAgentCallType;
    onChange: (callType: VoiceAgentCallType) => void;
    disabled?: boolean;
};

function CallTypeIcon({ callType }: { callType: VoiceAgentCallType }) {
    return callType === VoiceAgentCallType.INBOUND ? (
        <PhoneIncoming className="text-green-600 dark:text-green-400" />
    ) : (
        <PhoneOutgoing className="text-blue-600 dark:text-blue-400" />
    );
}

/** Inbound (answers the number's calls) or outbound (places calls), each option with a line on what it does. */
export function VoiceAgentCallTypeSelect({ id, value, onChange, disabled }: VoiceAgentCallTypeSelectProps) {
    return (
        <Select value={value} onValueChange={(next) => onChange(next as VoiceAgentCallType)} disabled={disabled}>
            <SelectTrigger id={id} className="w-full" data-testid="call-type-select">
                <SelectValue>
                    <CallTypeIcon callType={value} />
                    {VOICE_AGENT_CALL_TYPES[value].label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {VOICE_AGENT_CALL_TYPE_ORDER.map((callType) => (
                    <SelectItem key={callType} value={callType} data-testid={`call-type-${callType}`}>
                        <CallTypeIcon callType={callType} />
                        <span className="grid gap-0.5">
                            {VOICE_AGENT_CALL_TYPES[callType].label}
                            <span className="text-muted-foreground text-xs">
                                {VOICE_AGENT_CALL_TYPES[callType].description}
                            </span>
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
