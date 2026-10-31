import { VoiceAgentCallType, VoiceAgentChannel, VoiceProvider } from '@aixellabs/backend/db/types';

/**
 * Where an agent works comes from the numbers it is on, never from a setting on the agent: a phone line's slot
 * (answers or places its calls) or a WhatsApp number's (answers its chats and calls). The one source for that, both
 * in the pages and in the server's checks.
 */

/** A number's kind: a phone line (Telnyx, Twilio, VoiceLink) or a WhatsApp number. */
export type NumberKind = 'phone' | 'whatsapp';

export function numberKind(provider: VoiceProvider): NumberKind {
    return provider === VoiceProvider.WHATSAPP ? 'whatsapp' : 'phone';
}

/** Where an agent on these numbers works; null when it is on none yet. */
export function channelFromNumbers(numbers: { provider: VoiceProvider }[]): VoiceAgentChannel | null {
    const phone = numbers.some((n) => numberKind(n.provider) === 'phone');
    const whatsapp = numbers.some((n) => numberKind(n.provider) === 'whatsapp');
    if (phone && whatsapp) return VoiceAgentChannel.BOTH;
    if (phone) return VoiceAgentChannel.PHONE;
    return whatsapp ? VoiceAgentChannel.WHATSAPP : null;
}

export function servesPhone(channel: VoiceAgentChannel | null): boolean {
    return channel !== VoiceAgentChannel.WHATSAPP;
}

export function servesWhatsApp(channel: VoiceAgentChannel | null): boolean {
    return channel === VoiceAgentChannel.WHATSAPP || channel === VoiceAgentChannel.BOTH;
}

/** Why an agent cannot take a number's slot, in plain words, or null when it can: WhatsApp numbers only answer. */
export function slotProblem(agent: { name: string; callType: VoiceAgentCallType }, provider: VoiceProvider): string | null {
    return numberKind(provider) === 'whatsapp' && agent.callType !== VoiceAgentCallType.INBOUND
        ? `${agent.name} places calls, and a WhatsApp number only answers. Pick an agent that answers calls.`
        : null;
}
