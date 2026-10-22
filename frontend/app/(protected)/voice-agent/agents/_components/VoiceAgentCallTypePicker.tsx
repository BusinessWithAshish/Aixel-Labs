'use client';

import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { FieldDescription } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VOICE_AGENT_CALL_TYPE_ORDER, VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';

type VoiceAgentCallTypePickerProps = {
    value: VoiceAgentCallType;
    onChange: (callType: VoiceAgentCallType) => void;
    disabled?: boolean;
    labelledBy?: string;
};

/** Inbound (answers the number's calls) or outbound (places calls) as a two-way switch, with a line on the picked one. */
export function VoiceAgentCallTypePicker({ value, onChange, disabled, labelledBy }: VoiceAgentCallTypePickerProps) {
    return (
        <>
            <ToggleGroup
                type="single"
                variant="outline"
                value={value}
                // Radix sends '' when the picked item is clicked again: keep the current type.
                onValueChange={(next) => next && onChange(next as VoiceAgentCallType)}
                disabled={disabled}
                aria-labelledby={labelledBy}
                data-testid="call-type-picker"
            >
                {VOICE_AGENT_CALL_TYPE_ORDER.map((callType) => {
                    const { label, short } = VOICE_AGENT_CALL_TYPES[callType];
                    const inbound = callType === VoiceAgentCallType.INBOUND;
                    const Icon = inbound ? PhoneIncoming : PhoneOutgoing;
                    return (
                        <ToggleGroupItem key={callType} value={callType} data-testid={`call-type-${callType}`}>
                            <Icon
                                className={
                                    inbound ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                                }
                            />
                            {label}
                            <span className="text-muted-foreground hidden font-normal sm:inline">· {short}</span>
                        </ToggleGroupItem>
                    );
                })}
            </ToggleGroup>
            <FieldDescription className="text-xs">{VOICE_AGENT_CALL_TYPES[value].description}</FieldDescription>
        </>
    );
}
