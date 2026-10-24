import { VoiceProvider } from '@aixellabs/backend/db/types';

/** What the UI and errors call each number provider (client-safe). */
export type NumberProviderInfo = {
    label: string;
    /** Which numbers it is for, shown in the Connect dialog. */
    region: string;
    /** An example number to call, in the format the provider dials. */
    callExample: string;
    /** The provider's own mark, under public/brand-logos. */
    logo: string;
};

export const NUMBER_PROVIDERS: Record<VoiceProvider, NumberProviderInfo> = {
    [VoiceProvider.TELNYX]: {
        label: 'Telnyx',
        region: 'US and international numbers',
        callExample: '+14155550123',
        logo: '/brand-logos/telnyx.png',
    },
    [VoiceProvider.TWILIO]: {
        label: 'Twilio',
        region: 'US and international numbers',
        callExample: '+14155550123',
        logo: '/brand-logos/twilio.svg',
    },
    [VoiceProvider.VOICELINK]: {
        label: 'VoiceLink',
        region: 'Indian numbers (+91)',
        callExample: '+919876543210',
        logo: '/brand-logos/voicelink.png',
    },
    [VoiceProvider.WHATSAPP]: {
        label: 'WhatsApp',
        region: 'WhatsApp Business numbers, any country (answers calls)',
        callExample: '+919876543210',
        logo: '/brand-logos/whatsapp.svg',
    },
};

export const NUMBER_PROVIDER_ORDER: VoiceProvider[] = [
    VoiceProvider.TELNYX,
    VoiceProvider.TWILIO,
    VoiceProvider.VOICELINK,
    VoiceProvider.WHATSAPP,
];

/** Providers whose numbers can place calls (a WhatsApp number only answers, for now). */
export function placesCalls(provider: VoiceProvider): boolean {
    return provider !== VoiceProvider.WHATSAPP;
}

export function numberProviderInfo(provider: VoiceProvider): NumberProviderInfo {
    return NUMBER_PROVIDERS[provider] ?? NUMBER_PROVIDERS[VoiceProvider.TELNYX];
}
