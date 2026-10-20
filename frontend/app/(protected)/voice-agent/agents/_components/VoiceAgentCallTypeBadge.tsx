import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';
import { cn } from '@/lib/utils';

type VoiceAgentCallTypeBadgeProps = {
    callType: VoiceAgentCallType;
    className?: string;
};

/** "Inbound · answers calls" (green, as inbound calls are in Call Logs) or "Outbound · makes calls" (blue). */
export function VoiceAgentCallTypeBadge({ callType, className }: VoiceAgentCallTypeBadgeProps) {
    const inbound = callType === VoiceAgentCallType.INBOUND;
    const { label, short } = VOICE_AGENT_CALL_TYPES[callType];
    const Icon = inbound ? PhoneIncoming : PhoneOutgoing;

    return (
        <Badge
            variant={inbound ? 'green' : 'blue'}
            className={cn(
                inbound ? 'dark:bg-green-500/15 dark:text-green-400' : 'dark:bg-blue-500/15 dark:text-blue-400',
                className,
            )}
            data-testid="voice-agent-call-type"
            data-call-type={callType}
        >
            <Icon />
            {label} · {short}
        </Badge>
    );
}
