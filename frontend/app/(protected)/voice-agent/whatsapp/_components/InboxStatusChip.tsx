import { Bot, Hand, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { InboxStatus } from '@/helpers/voice-inbox';

/** Who answers a conversation right now, in one word. */
export const INBOX_STATUS: Record<InboxStatus, { label: string; variant: 'green' | 'yellow' | 'blue'; icon: typeof Bot }> = {
    [InboxStatus.AI]: { label: 'AI', variant: 'green', icon: Bot },
    [InboxStatus.NEEDS_YOU]: { label: 'Waiting', variant: 'yellow', icon: Hand },
    [InboxStatus.HUMAN]: { label: 'You', variant: 'blue', icon: UserRound },
};

export function InboxStatusChip({ status, name }: { status: InboxStatus; name?: string | null }) {
    const { label, variant, icon: Icon } = INBOX_STATUS[status];
    return (
        <Badge variant={variant} className="gap-1">
            <Icon className="size-3" aria-hidden />
            {status === InboxStatus.HUMAN && name ? name : label}
        </Badge>
    );
}
