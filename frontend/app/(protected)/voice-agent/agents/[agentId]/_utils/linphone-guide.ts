import { guideImage, type SetupGuide, type SetupGuideImage } from '@/helpers/voice-setup-guides';

/**
 * Linphone by hand, for when its setup link or QR code cannot be used. These are the settings that made calls work
 * on a mobile network that blocks SIP on 5060 (Ashish's tests, 2026-10-24); the setup link applies all of them.
 *
 * Screenshots: put `<step id>.webp` (1400x875) in `public/voice-agent/guides/linphone/` and add the step's id here.
 */
const SCREENSHOTS = new Set<string>([]);

const ALT: Record<string, string> = {
    install: 'Linphone’s download page',
    account: 'Linphone’s “Use a SIP account” form with username, password, domain and TLS filled in',
    tls: 'The account’s settings with the outbound proxy and registrar set to sip.telnyx.com over TLS',
    active: 'Linphone’s account list with the Telnyx account selected',
    network: 'Linphone’s settings with IPv6 and the video codecs turned off',
};

const image = (id: string): SetupGuideImage | undefined =>
    SCREENSHOTS.has(id) ? guideImage('linphone', `${id}.webp`, ALT[id]) : undefined;

const step = (id: string, title: string, body: string[], link?: SetupGuide['steps'][number]['link']) => ({
    id,
    title,
    body,
    image: image(id),
    link,
});

export const LINPHONE_GUIDE: SetupGuide = {
    title: 'Set up Linphone by hand',
    steps: [
        step(
            'install',
            'Install Linphone',
            ['Free on Mac, Windows, Linux, iPhone and Android. Open it once it is installed.'],
            { href: 'https://www.linphone.org/en/download/', label: 'Download Linphone' },
        ),
        step('account', 'Add your SIP account', [
            'In the account assistant choose “Use a SIP account” (a third-party account). If Linphone first makes you create a linphone.org account, do that, then add this one too.',
            'Username and password: the ones shown in Aixel Labs. Domain: sip.telnyx.com. Transport: TLS.',
        ]),
        step('tls', 'Send everything over TLS', [
            'Open the account’s settings. Set the Outbound SIP proxy URI and the Registrar URI to <sip:sip.telnyx.com;transport=tls>.',
            'This sends calls over the same TLS connection the account signs in with, which works on networks that block internet calling.',
        ]),
        step('active', 'Make it the active account', [
            'Pick the Telnyx account at the top of the account list, not the linphone.org one, so your calls go out through it.',
        ]),
        step('network', 'Turn off IPv6 and video', [
            'Settings, Network: turn IPv6 off. Advanced settings, Video codecs: turn off AV1, H265 and H264.',
            'Leave media encryption on None. Then dial the agent’s address from the Aixel Labs dialog.',
        ]),
    ],
};
