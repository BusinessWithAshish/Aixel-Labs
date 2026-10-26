import { Phone } from 'lucide-react';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import type { AgentChannels } from '@/helpers/voice-agent-channels';

/**
 * Where an agent talks to people, at a glance: "Phone calls", "WhatsApp" (chats and calls), "Phone + WhatsApp",
 * or "No number yet". It comes from the numbers the agent is on, so it can never disagree with them.
 */
export function AgentChannelBadge({ channels }: { channels: AgentChannels | undefined }) {
    const { phone = false, whatsapp = false } = channels ?? {};
    if (!phone && !whatsapp) {
        return (
            <Badge variant="outline" className="text-muted-foreground">
                No number yet
            </Badge>
        );
    }
    return (
        <Badge
            variant="outline"
            className="gap-1"
            title={whatsapp ? 'On WhatsApp it answers both chats and calls' : undefined}
            data-testid="agent-channels"
        >
            {phone ? <Phone className="size-3 text-green-600" aria-hidden /> : null}
            {phone ? 'Phone calls' : null}
            {phone && whatsapp ? <span className="text-muted-foreground">+</span> : null}
            {whatsapp ? <NumberProviderLogo provider={VoiceProvider.WHATSAPP} className="size-3" /> : null}
            {whatsapp ? (phone ? 'WhatsApp' : 'WhatsApp chats + calls') : null}
        </Badge>
    );
}
