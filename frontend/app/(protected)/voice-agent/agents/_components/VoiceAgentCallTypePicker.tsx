'use client';

import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
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

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelledBy}
            className={cn('grid sm:grid-cols-2', large ? 'gap-3' : 'gap-2', className)}
        >
            {VOICE_AGENT_CALL_TYPE_ORDER.map((callType) => {
                const { label, short, description } = VOICE_AGENT_CALL_TYPES[callType];
                const checked = value === callType;
                const inbound = callType === VoiceAgentCallType.INBOUND;
                const Icon = inbound ? PhoneIncoming : PhoneOutgoing;

                return (
                    <button
                        key={callType}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        onClick={() => onChange(callType)}
                        data-testid={`call-type-${callType.toLowerCase()}`}
                        className={cn(
                            'flex min-w-0 rounded-xl border text-left transition-colors outline-none',
                            'hover:bg-accent/50 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                            'disabled:pointer-events-none disabled:opacity-50',
                            large ? 'flex-col gap-3 p-4' : 'items-start gap-2.5 p-3',
                            checked ? 'border-primary bg-primary/5 ring-primary ring-1' : 'border-border',
                        )}
                    >
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
                        <span className="grid min-w-0 gap-1">
                            <span className={cn('font-medium', large ? 'text-base' : 'text-sm')}>
                                {label} <span className="text-muted-foreground font-normal">· {short}</span>
                            </span>
                            <span className={cn('text-muted-foreground', large ? 'text-sm' : 'text-xs')}>{description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
