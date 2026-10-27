import { Phone } from 'lucide-react';
import { VoiceAgentChannel, VoiceProvider } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { CHANNEL_WORDS, servesPhone, servesWhatsApp } from '@/helpers/voice-agent-channels';

/** Where an agent works, at a glance: "Phone calls", "WhatsApp" or "Phone + WhatsApp". */
export function AgentChannelBadge({ channel }: { channel: VoiceAgentChannel }) {
    return (
        <Badge variant="outline" className="gap-1" title={CHANNEL_WORDS[channel].description} data-testid="agent-channel">
            {servesPhone(channel) ? <Phone className="size-3 text-green-600" aria-hidden /> : null}
            {servesWhatsApp(channel) ? <NumberProviderLogo provider={VoiceProvider.WHATSAPP} className="size-3" /> : null}
            {CHANNEL_WORDS[channel].title}
        </Badge>
    );
}
