import { SOFTPHONE_SIP_DOMAIN, SOFTPHONE_TLS_PROXY } from '@/helpers/linphone-provisioning';
import type { SetupGuide, SetupGuideImage } from '@/helpers/voice-setup-guides';

/**
 * Linphone (desktop) step by step, on Ashish's annotated screenshots (2026-10-24) in
 * `public/voice-agent/guides/linphone/` (1400x783). Path A, the setup link, applies every setting by itself; path B
 * is by hand, with the settings that made calls work on a mobile network that blocks SIP on 5060.
 */
const image = (file: string, alt: string): SetupGuideImage => ({
    src: `/voice-agent/guides/linphone/${file}`,
    alt,
    width: 1400,
    height: 783,
});

const INSTALL = {
    id: 'install',
    title: 'Install Linphone and open it',
    body: ['Free on Mac, Windows, Linux, iPhone and Android.'],
    link: { href: 'https://www.linphone.org/en/download/', label: 'Download Linphone' },
};

/** Path A: Linphone fetches the whole account from the one-time setup link. */
export function linphoneLinkGuide(setupLink: string | null): SetupGuide {
    return {
        title: 'Set up Linphone with your setup link',
        steps: [
            INSTALL,
            {
                id: 'remote-provisioning',
                title: 'Click Remote provisioning',
                body: [
                    'On Linphone’s first screen. On a phone, choose Scan QR code and scan the code in Aixel Labs instead.',
                ],
                image: image(
                    'link-1-remote-provisioning.webp',
                    'Linphone’s Connection screen with the Remote provisioning button highlighted',
                ),
            },
            {
                id: 'paste-link',
                title: 'Paste your setup link, then Confirm',
                body: [
                    'Linphone downloads your account and signs in over TLS by itself: no other setting to change.',
                    'The link works once, for 10 minutes. Expired? Make a new setup link in Aixel Labs.',
                ],
                image: image(
                    'link-2-paste-link.webp',
                    'The Download a remote configuration dialog with the link field and the Confirm button highlighted',
                ),
                values: setupLink ? [{ label: 'Setup link', value: setupLink }] : undefined,
            },
            {
                id: 'signed-in',
                title: 'Check it signed in',
                body: ['Back in Aixel Labs, click Check again: it shows Signed in. Then dial the agent’s address.'],
            },
        ],
    };
}

/** Path B: the Third-party SIP account form, by hand. */
export function linphoneManualGuide(login: { userName: string; password: string | null }): SetupGuide {
    return {
        title: 'Set up Linphone by hand',
        steps: [
            INSTALL,
            {
                id: 'third-party',
                title: 'Click Third-party SIP account',
                body: ['On Linphone’s first screen.'],
                image: image(
                    'manual-1-third-party.webp',
                    'Linphone’s Connection screen with Third-party SIP account highlighted',
                ),
            },
            {
                id: 'understand',
                title: 'Click I understand',
                body: ['Linphone’s own chat and video features are not needed for calls.'],
                image: image('manual-2-understand.webp', 'The third-party account notice with I understand highlighted'),
            },
            {
                id: 'form',
                title: 'Fill in the account',
                body: [
                    'Username, password and domain on the left; Transport TLS. Under Advanced parameters, the Registrar URI and the Outbound SIP Proxy URI, so every call goes over TLS.',
                    ...(login.password
                        ? []
                        : ['The password was shown once, when it was set. Make a new setup link for a new one.']),
                ],
                image: image(
                    'manual-3-form.webp',
                    'The Third-party SIP account form with username, password, domain, transport, registrar and outbound proxy filled in',
                ),
                values: [
                    { label: 'Username', value: login.userName },
                    ...(login.password ? [{ label: 'Password', value: login.password }] : []),
                    { label: 'Domain', value: SOFTPHONE_SIP_DOMAIN },
                    { label: 'Transport', value: 'TLS' },
                    { label: 'Registrar URI', value: SOFTPHONE_TLS_PROXY },
                    { label: 'Outbound SIP Proxy URI', value: SOFTPHONE_TLS_PROXY },
                ],
            },
            {
                id: 'connection',
                title: 'Click Connection',
                body: [
                    'Linphone signs in. If it also keeps a linphone.org account, pick the Telnyx one as the active account.',
                ],
                image: image('manual-4-connection.webp', 'The account form with the Connection button highlighted'),
            },
            {
                id: 'settings',
                title: 'Turn off IPv6 and video',
                body: [
                    'Settings, Network: turn IPv6 off.',
                    'Settings, Advanced parameters, Video codecs: turn off AV1, H265 and H264. Leave media encryption on None.',
                ],
            },
        ],
    };
}
