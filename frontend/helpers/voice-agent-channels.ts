import { VoiceAgentCallType, VoiceAgentChannel, VoiceProvider } from '@aixellabs/backend/db/types';

/**
 * An agent's channel (`VoiceAgentDoc.channel`): where it works and so where the app shows it. The one source for
 * which agents fit which numbers, both in the pickers and in the server's checks.
 */

/** Agents saved before WhatsApp are phone agents. */
export function channelOf(agent: { channel?: VoiceAgentChannel | null }): VoiceAgentChannel {
    return agent.channel ?? VoiceAgentChannel.PHONE;
}

export function servesPhone(channel: VoiceAgentChannel): boolean {
    return channel !== VoiceAgentChannel.WHATSAPP;
}

export function servesWhatsApp(channel: VoiceAgentChannel): boolean {
    return channel !== VoiceAgentChannel.PHONE;
}

/** Whether an agent of this channel may work a number of this provider. */
export function fitsNumber(channel: VoiceAgentChannel, provider: VoiceProvider): boolean {
    return provider === VoiceProvider.WHATSAPP ? servesWhatsApp(channel) : servesPhone(channel);
}

/** Why an agent cannot work a number, in plain words, or null when it can. */
export function channelProblem(
    agent: { name: string; channel?: VoiceAgentChannel | null; callType: VoiceAgentCallType },
    provider: VoiceProvider,
): string | null {
    const channel = channelOf(agent);
    if (fitsNumber(channel, provider)) return null;
    return provider === VoiceProvider.WHATSAPP
        ? `${agent.name} is a phone agent. Pick a WhatsApp agent, or set ${agent.name} to answer WhatsApp too on its page.`
        : `${agent.name} is a WhatsApp agent. Pick a phone agent, or set ${agent.name} to take phone calls too on its page.`;
}

/** A channel an agent of this call type may have: placing calls is phone only. */
export function channelAllowed(channel: VoiceAgentChannel, callType: VoiceAgentCallType): boolean {
    return callType === VoiceAgentCallType.INBOUND || channel === VoiceAgentChannel.PHONE;
}

export const CHANNEL_WORDS: Record<VoiceAgentChannel, { title: string; description: string }> = {
    [VoiceAgentChannel.PHONE]: { title: 'Phone calls', description: 'Answers calls on your Telnyx, Twilio or VoiceLink numbers.' },
    [VoiceAgentChannel.WHATSAPP]: { title: 'WhatsApp', description: 'Answers chats, voice notes and calls on your WhatsApp numbers.' },
    [VoiceAgentChannel.BOTH]: {
        title: 'Phone + WhatsApp',
        description: 'One agent for both, with one memory: for a number that is a phone line and on WhatsApp.',
    },
};

/** Which agents a list shows: the Voice agents page (phone) or the WhatsApp section. */
export type AgentScope = 'phone' | 'whatsapp';

export function inScope(channel: VoiceAgentChannel, scope: AgentScope): boolean {
    return scope === 'whatsapp' ? servesWhatsApp(channel) : servesPhone(channel);
}

/** Which numbers a list shows: phone lines, or WhatsApp numbers. */
export function numberInScope(provider: VoiceProvider, scope: AgentScope): boolean {
    return (provider === VoiceProvider.WHATSAPP) === (scope === 'whatsapp');
}
