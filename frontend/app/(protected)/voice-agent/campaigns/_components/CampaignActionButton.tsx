import { Loader2, Pause, Play, RotateCcw, type LucideIcon } from 'lucide-react';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import type { VoiceCampaignAction } from '@/app/actions/voice-campaign-actions';
import { Button } from '@/components/ui/button';

const NEXT_ACTION: Partial<
    Record<VoiceCampaignStatus, { action: VoiceCampaignAction; label: string; icon: LucideIcon; primary: boolean }>
> = {
    [VoiceCampaignStatus.DRAFT]: { action: 'start', label: 'Start', icon: Play, primary: true },
    [VoiceCampaignStatus.RUNNING]: { action: 'pause', label: 'Pause', icon: Pause, primary: false },
    [VoiceCampaignStatus.PAUSED]: { action: 'resume', label: 'Resume', icon: RotateCcw, primary: true },
};

/** Start a draft, pause a running campaign, resume a paused one; nothing for a finished one. */
export function CampaignActionButton({
    status,
    busy,
    onAction,
    size,
}: {
    status: VoiceCampaignStatus;
    /** The action in flight (any action disables the button). */
    busy: string | null;
    onAction: (action: VoiceCampaignAction) => void;
    size?: 'sm' | 'default';
}) {
    const next = NEXT_ACTION[status];
    if (!next) return null;
    const Icon = busy === next.action ? Loader2 : next.icon;
    return (
        <Button
            size={size}
            variant={next.primary ? 'default' : 'outline'}
            onClick={() => onAction(next.action)}
            disabled={busy !== null}
        >
            <Icon className={busy === next.action ? 'size-4 animate-spin' : 'size-4'} />
            {next.label}
        </Button>
    );
}
