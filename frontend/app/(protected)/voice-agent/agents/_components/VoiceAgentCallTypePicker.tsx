'use client';

import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { VOICE_AGENT_CALL_TYPE_ORDER, VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';
import { cn } from '@/lib/utils';

type VoiceAgentCallTypePickerProps = {
    value: VoiceAgentCallType | null;
    onChange: (callType: VoiceAgentCallType) => void;
    /** `lg`: the two big choices that start the create flow. `sm`: the editor's compact switch. */
    size?: 'lg' | 'sm';
    disabled?: boolean;
    labelledBy?: string;
    className?: string;
};

/** Inbound (answers the number's calls) or outbound (places calls), as two cards in a radio group. */
export function VoiceAgentCallTypePicker({
    value,
    onChange,
    size = 'lg',
    disabled,
    labelledBy,
    className,
}: VoiceAgentCallTypePickerProps) {
    const large = size === 'lg';
    const options = VOICE_AGENT_CALL_TYPE_ORDER.map((callType) => {
        const { label, short, description } = VOICE_AGENT_CALL_TYPES[callType];
        const inbound = callType === VoiceAgentCallType.INBOUND;
        const Icon = inbound ? PhoneIncoming : PhoneOutgoing;
        return {
            value: callType,
            title: (
                <>
                    {label} <span className="text-muted-foreground font-normal">· {short}</span>
                </>
            ),
            description,
            media: (
                <span
                    className={cn(
                        'flex shrink-0 items-center justify-center rounded-lg',
                        large ? 'size-10' : 'size-8',
                        inbound
                            ? 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
                    )}
                >
                    <Icon className={large ? 'size-5' : 'size-4'} />
                </span>
            ),
        };
    });

    return (
        <RadioCards
            value={value}
            onValueChange={onChange}
            options={options}
            disabled={disabled}
            aria-labelledby={labelledBy}
            className={cn(large && 'gap-3', className)}
            classNames={{ description: large ? 'text-sm' : undefined }}
        />
    );
}
