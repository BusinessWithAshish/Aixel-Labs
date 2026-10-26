import { VoiceProvider } from '@aixellabs/backend/db/types';

/** Where an agent talks to people, from the numbers it is on: phone calls (Telnyx, Twilio, VoiceLink), WhatsApp (chats and calls), both, or nowhere yet. */
export type AgentChannels = { phone: boolean; whatsapp: boolean };

type NumberJobs = { provider: VoiceProvider; inboundAgentId?: unknown; outboundAgentId?: unknown };

/** Each agent's channels, by agent id, from the owner's numbers. */
export function agentChannelsOf(numbers: NumberJobs[]): Record<string, AgentChannels> {
    const out: Record<string, AgentChannels> = {};
    for (const n of numbers) {
        for (const id of [n.inboundAgentId, n.outboundAgentId]) {
            if (!id) continue;
            const channels = (out[String(id)] ??= { phone: false, whatsapp: false });
            if (n.provider === VoiceProvider.WHATSAPP) channels.whatsapp = true;
            else channels.phone = true;
        }
    }
    return out;
}

/** An agent's channels from the providers of the numbers it is on. */
export function channelsOfProviders(providers: VoiceProvider[]): AgentChannels {
    return {
        phone: providers.some((p) => p !== VoiceProvider.WHATSAPP),
        whatsapp: providers.includes(VoiceProvider.WHATSAPP),
    };
}
