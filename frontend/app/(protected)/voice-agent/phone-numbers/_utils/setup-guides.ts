import { VoiceProvider } from '@aixellabs/backend/db/types';

export type SetupGuideImage = {
    /** Under `public/`, e.g. `/voice-agent/guides/telnyx/2-api-key.webp`. */
    src: string;
    alt: string;
    width: number;
    height: number;
};

export type SetupGuideStep = {
    /** Stable id, so a link elsewhere can open the guide at this step. */
    id: string;
    title: string;
    /** One or two short paragraphs. */
    body: string[];
    /** A screenshot of the step. Optional: a step without one shows its text only. */
    image?: SetupGuideImage;
    /** A page in the provider's own portal, opened in a new tab. */
    link?: { href: string; label: string };
};

export type SetupGuide = {
    provider: VoiceProvider;
    title: string;
    steps: SetupGuideStep[];
};

/** Step ids other components open the Telnyx guide at. */
export const TELNYX_GUIDE_STEP = {
    ACCOUNT: 'account',
    API_KEY: 'api-key',
    NUMBER: 'number',
    OUTBOUND_PROFILE: 'outbound-profile',
    CONNECT: 'connect',
    CHANGES: 'changes',
} as const;

const TELNYX_IMAGE_DIR = '/voice-agent/guides/telnyx';
const SCREENSHOT_SIZE = { width: 1400, height: 875 };

function telnyxImage(file: string, alt: string): SetupGuideImage {
    return { src: `${TELNYX_IMAGE_DIR}/${file}`, alt, ...SCREENSHOT_SIZE };
}

const TELNYX_GUIDE: SetupGuide = {
    provider: VoiceProvider.TELNYX,
    title: 'Set up Telnyx for your voice agents',
    steps: [
        {
            id: TELNYX_GUIDE_STEP.ACCOUNT,
            title: 'Sign in to Telnyx, or create an account',
            body: [
                'Telnyx is the phone company your agents call through, with your own account and your own bill. A free trial account is enough to try it.',
                'A trial account can only call the one number you verify (Voice Suite, Verified Numbers), and some countries stay blocked. Upgrade the account before you call real leads.',
            ],
            image: telnyxImage(
                '1-telnyx-account.webp',
                'The Telnyx sign-up page, with the create-account form and the Log in link highlighted',
            ),
            link: { href: 'https://telnyx.com/sign-up', label: 'Create a Telnyx account' },
        },
        {
            id: TELNYX_GUIDE_STEP.API_KEY,
            title: 'Create an API key and copy it',
            body: [
                'In the Telnyx portal, click your initials at the top right and choose API keys. Click Create API Key, name it something like “Aixel Labs” and choose no expiration.',
                'Copy the key right away: Telnyx shows it only once. If you lose it, create a new one.',
            ],
            image: telnyxImage(
                '2-api-key.webp',
                'The API Keys page in the Telnyx portal, with the Create API Key button and the API keys item of the account menu highlighted',
            ),
            link: { href: 'https://portal.telnyx.com/#/api-keys', label: 'Open API Keys' },
        },
        {
            id: TELNYX_GUIDE_STEP.NUMBER,
            title: 'Have a phone number in Telnyx',
            body: [
                'Your agents call from, and answer, a number in your own Telnyx account. In Voice Suite, open Phone Numbers to see the ones you have. No number yet? Click Buy number.',
                'A trial account can place one number order, and its number is taken back after 30 days unless you upgrade.',
            ],
            image: telnyxImage(
                '3-phone-number.webp',
                'The My Numbers page in the Telnyx portal, listing one number, with the Buy number button highlighted',
            ),
            link: { href: 'https://portal.telnyx.com/#/voice/my-numbers', label: 'Open Phone Numbers' },
        },
        {
            id: TELNYX_GUIDE_STEP.OUTBOUND_PROFILE,
            title: 'Allow the countries you will call',
            body: [
                'Calls out go through an outbound voice profile. In Voice Suite, open Outbound Voice: most accounts already have one, named Default. If the list is empty, create one.',
                'Edit the profile, open Allowed Destinations, tick every country you plan to call and save. If you have more than one profile, do it on each. Some countries need Telnyx Level 2 verification first.',
            ],
            image: telnyxImage(
                '4-outbound-voice-profile.webp',
                'The Allowed Destinations tab of an outbound voice profile in the Telnyx portal, with the country list highlighted',
            ),
            link: { href: 'https://portal.telnyx.com/#/outbound-profiles', label: 'Open Outbound Voice' },
        },
        {
            id: TELNYX_GUIDE_STEP.CONNECT,
            title: 'Paste the key here and pick your number',
            body: [
                'On this page, click Connect a number, choose Telnyx, paste the key and click Find my numbers.',
                'Tick the numbers you want and import them. Importing changes nothing in Telnyx: each number keeps ringing where it does.',
            ],
            image: telnyxImage(
                '5-connect-in-aixel-labs.webp',
                'The Connect a number dialog in Aixel Labs, with the Telnyx API key field highlighted',
            ),
        },
        {
            id: TELNYX_GUIDE_STEP.CHANGES,
            title: 'What Aixel Labs changes in your Telnyx account',
            body: [
                'When a number is set to “Make calls” (or places a test call), we add a Voice API app named “Aixel Labs voice agents” (Voice Suite, Programmable Voice). A trial account can hold only one, so if you already have one we use it as it is.',
                'When a number is set to “Answer calls”, we add a TeXML app for that number and point the number at it. Pick another job for it, or remove it, and the number goes back to the connection it had before; removing it also deletes the apps we added.',
            ],
            image: telnyxImage(
                '6-what-we-change.webp',
                'The Voice API Applications list in the Telnyx portal, with the Aixel Labs voice agents app and the TeXML Applications tab highlighted',
            ),
            link: { href: 'https://portal.telnyx.com/#/call-control/applications', label: 'Open Programmable Voice' },
        },
    ],
};

/** Step ids other components open the Twilio guide at. */
export const TWILIO_GUIDE_STEP = {
    ACCOUNT: 'account',
    API_KEY: 'api-key',
    ACCOUNT_SID: 'account-sid',
    NUMBER: 'number',
    GEO_PERMISSIONS: 'geo-permissions',
    CONNECT: 'connect',
    CHANGES: 'changes',
} as const;

type TwilioGuideStepId = (typeof TWILIO_GUIDE_STEP)[keyof typeof TWILIO_GUIDE_STEP];

/**
 * Screenshots for the Twilio guide, by step. None exist yet (they need a Twilio account to be taken
 * from, and only plain screenshots of the Console: no Twilio logos or brand art). To add one, save
 * it as `public/voice-agent/guides/twilio/<n>-<step>.webp` at 1400x875, like the Telnyx ones, and
 * add `[TWILIO_GUIDE_STEP.X]: { src: '/voice-agent/guides/twilio/…', alt, ...SCREENSHOT_SIZE }`
 * here; the step shows it from then on (the setup-guide spec checks that every image loads).
 */
const TWILIO_SCREENSHOTS: Partial<Record<TwilioGuideStepId, SetupGuideImage>> = {};

const TWILIO_GUIDE: SetupGuide = {
    provider: VoiceProvider.TWILIO,
    title: 'Set up Twilio for your voice agents',
    steps: [
        {
            id: TWILIO_GUIDE_STEP.ACCOUNT,
            title: 'Sign in to Twilio, or create an account',
            body: [
                'Twilio is the phone company your agents call through, with your own account and your own bill. A free trial account is enough to try it.',
                'A trial account can only call numbers you verify (Phone Numbers, Verified Caller IDs), and plays a short trial message first: on calls your agent places, the person has to press a key before they hear the agent. Upgrade the account before you call real leads.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.ACCOUNT],
            link: { href: 'https://www.twilio.com/try-twilio', label: 'Create a Twilio account' },
        },
        {
            id: TWILIO_GUIDE_STEP.API_KEY,
            title: 'Create an API key and copy it',
            body: [
                'In the Twilio Console, open Account, then API keys & tokens, and click Create API key. Name it something like “Aixel Labs” and pick the key type Restricted.',
                'Give it only what your agents use. Phone Numbers: read and update your numbers (to list them and point a number at your agent). Voice: Calls (create, read and update: to place calls and hang up) and Call Recordings (create and read: to record calls and play them in Call logs). A Standard key works too, with access to everything.',
                'Copy the SID (it starts with SK) and the Secret right away: Twilio shows the secret only once. You can paste your Auth Token instead, but an API key is safer: you can delete it at any time without changing anything else.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.API_KEY],
            link: {
                href: 'https://console.twilio.com/us1/account/keys-credentials/api-keys',
                label: 'Open API keys & tokens',
            },
        },
        {
            id: TWILIO_GUIDE_STEP.ACCOUNT_SID,
            title: 'Copy your Account SID',
            body: [
                'Your Account SID starts with AC. It is on the Twilio Console home page, under Account Info, next to the Auth Token.',
                'We need it with the API key: Twilio files every number and call under the account.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.ACCOUNT_SID],
            link: { href: 'https://console.twilio.com/', label: 'Open the Twilio Console' },
        },
        {
            id: TWILIO_GUIDE_STEP.NUMBER,
            title: 'Have a phone number with voice in Twilio',
            body: [
                'Your agents call from, and answer, a number in your own Twilio account. Phone Numbers, Manage, Active numbers lists the ones you have. No number yet? Buy one there, with Voice ticked.',
                'Numbers that only send messages cannot take calls, so they cannot be imported.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.NUMBER],
            link: {
                href: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming',
                label: 'Open Active numbers',
            },
        },
        {
            id: TWILIO_GUIDE_STEP.GEO_PERMISSIONS,
            title: 'Allow the countries you will call',
            body: [
                'Twilio only places calls to countries you have allowed. Open Voice, Settings, Geo permissions, tick every country you plan to call and save.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.GEO_PERMISSIONS],
            link: {
                href: 'https://console.twilio.com/us1/develop/voice/settings/geo-permissions',
                label: 'Open Geo permissions',
            },
        },
        {
            id: TWILIO_GUIDE_STEP.CONNECT,
            title: 'Paste the details here and pick your number',
            body: [
                'On this page, click Connect a number and choose Twilio. Paste the Account SID, the API key SID and its secret, and click Find my numbers.',
                'Tick the numbers you want and import them. Importing changes nothing in Twilio: each number keeps ringing where it does.',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.CONNECT],
        },
        {
            id: TWILIO_GUIDE_STEP.CHANGES,
            title: 'What Aixel Labs changes in your Twilio account',
            body: [
                'When a number is set to “Answer calls”, we set its Voice URL (A call comes in, Webhook) to our agent. If the number was on a TwiML app or a SIP trunk, we take it off. We save its settings first: pick another job for it, or remove it, and they go back exactly as they were.',
                'Calls your agents place need no change in your account. They connect when the person answers, and are recorded in your Twilio account (Monitor, Call recordings).',
            ],
            image: TWILIO_SCREENSHOTS[TWILIO_GUIDE_STEP.CHANGES],
            link: {
                href: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming',
                label: 'Open Active numbers',
            },
        },
    ],
};

const SETUP_GUIDES: Partial<Record<VoiceProvider, SetupGuide>> = {
    [VoiceProvider.TELNYX]: TELNYX_GUIDE,
    [VoiceProvider.TWILIO]: TWILIO_GUIDE,
};

/** Providers that have a guide, in the order the guide switcher lists them. */
export const SETUP_GUIDE_PROVIDERS: VoiceProvider[] = [VoiceProvider.TELNYX, VoiceProvider.TWILIO];

/** The step-by-step setup guide for a provider, or `null` when it has none yet. */
export function setupGuideFor(provider: VoiceProvider): SetupGuide | null {
    return SETUP_GUIDES[provider] ?? null;
}

/** Index of a step by id; the first step when the id is missing or unknown. */
export function setupGuideStepIndex(guide: SetupGuide, stepId?: string | null): number {
    if (!stepId) return 0;
    return Math.max(
        0,
        guide.steps.findIndex((step) => step.id === stepId),
    );
}
