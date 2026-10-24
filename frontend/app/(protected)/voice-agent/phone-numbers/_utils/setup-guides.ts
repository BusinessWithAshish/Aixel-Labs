import { VoiceProvider } from '@aixellabs/backend/db/types';
import { guideImage, type SetupGuide } from '@/helpers/voice-setup-guides';

export type { SetupGuide };

/** Step ids other components open the Telnyx guide at. */
export const TELNYX_GUIDE_STEP = {
    ACCOUNT: 'account',
    API_KEY: 'api-key',
    NUMBER: 'number',
    OUTBOUND_PROFILE: 'outbound-profile',
    CONNECT: 'connect',
    CHANGES: 'changes',
} as const;

const telnyxImage = (file: string, alt: string) => guideImage('telnyx', file, alt);

const TELNYX_GUIDE: SetupGuide = {
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
                'On this page, open Connect a number, choose Telnyx, paste the key and click Find my numbers.',
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
                'When an agent that makes calls uses a number (or it places a test call), we add a Voice API app named “Aixel Labs voice agents” (Voice Suite, Programmable Voice). A trial account can hold only one, so if you already have one we use it as it is.',
                'When an agent that answers calls uses a number, we add a TeXML app for that number and point the number at it. Unlink it from the agent, or remove it, and the number goes back to the connection it had before; removing it also deletes the apps we added.',
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

const twilioImage = (file: string, alt: string) => guideImage('twilio', file, alt);

const TWILIO_GUIDE: SetupGuide = {
    title: 'Set up Twilio for your voice agents',
    steps: [
        {
            id: TWILIO_GUIDE_STEP.ACCOUNT,
            title: 'Sign in to Twilio, or create an account',
            body: [
                'Twilio is the phone company your agents call through, with your own account and your own bill. A free trial account is enough to try it.',
                'A trial account can only call numbers you verify (Phone Numbers, Verified Caller IDs), and plays a short trial message first: on calls your agent places, the person has to press a key before they hear the agent. Upgrade the account before you call real leads.',
            ],
            image: twilioImage(
                '1-twilio-account.webp',
                'An illustration of the Twilio sign-up form, with the form and the Log in link highlighted',
            ),
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
            image: twilioImage(
                '2-api-key.webp',
                'An illustration of creating an API key in the Twilio Console, with the Restricted key type and the Create button highlighted',
            ),
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
            image: twilioImage(
                '3-account-sid.webp',
                'An illustration of Account Info on the Twilio Console home page, with the Account SID highlighted',
            ),
            link: { href: 'https://console.twilio.com/', label: 'Open the Twilio Console' },
        },
        {
            id: TWILIO_GUIDE_STEP.NUMBER,
            title: 'Have a phone number with voice in Twilio',
            body: [
                'Your agents call from, and answer, a number in your own Twilio account. Phone Numbers, Manage, Active numbers lists the ones you have. No number yet? Buy one there, with Voice ticked.',
                'Numbers that only send messages cannot take calls, so they cannot be imported.',
            ],
            image: twilioImage(
                '4-phone-number.webp',
                'An illustration of Active numbers in the Twilio Console, with a number that has Voice and the Buy a number button highlighted',
            ),
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
            image: twilioImage(
                '5-geo-permissions.webp',
                'An illustration of Voice Geo permissions in the Twilio Console, with the ticked countries and the Save button highlighted',
            ),
            link: {
                href: 'https://console.twilio.com/us1/develop/voice/settings/geo-permissions',
                label: 'Open Geo permissions',
            },
        },
        {
            id: TWILIO_GUIDE_STEP.CONNECT,
            title: 'Paste the details here and pick your number',
            body: [
                'On this page, open Connect a number and choose Twilio. Paste the Account SID, the API key SID and its secret, and click Find my numbers.',
                'Tick the numbers you want and import them. Importing changes nothing in Twilio: each number keeps ringing where it does.',
            ],
            image: twilioImage(
                '6-connect-in-aixel-labs.webp',
                'An illustration of the Connect a Twilio number dialog in Aixel Labs, with the credential fields highlighted',
            ),
        },
        {
            id: TWILIO_GUIDE_STEP.CHANGES,
            title: 'What Aixel Labs changes in your Twilio account',
            body: [
                'When an agent that answers calls uses a number, we set its Voice URL (A call comes in, Webhook) to our agent. If the number was on a TwiML app or a SIP trunk, we take it off. We save its settings first: unlink it from the agent, or remove it, and they go back exactly as they were.',
                'Calls your agents place need no change in your account. They connect when the person answers, and are recorded in your Twilio account (Monitor, Call recordings).',
            ],
            image: twilioImage(
                '7-what-we-change.webp',
                'An illustration of a number’s voice configuration in the Twilio Console, with the webhook Aixel Labs sets highlighted',
            ),
            link: {
                href: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming',
                label: 'Open Active numbers',
            },
        },
    ],
};

/** Step ids other components open the VoiceLink guide at. */
export const VOICELINK_GUIDE_STEP = {
    ACCOUNT: 'account',
    API_TOKEN: 'api-token',
    NUMBER: 'number',
    WEBSOCKET: 'websocket',
    CONNECT: 'connect',
    CHANGES: 'changes',
} as const;

const voicelinkImage = (file: string, alt: string) => guideImage('voicelink', file, alt);

const VOICELINK_GUIDE: SetupGuide = {
    title: 'Set up VoiceLink for your voice agents',
    steps: [
        {
            id: VOICELINK_GUIDE_STEP.ACCOUNT,
            title: 'Sign in to your VoiceLink panel',
            body: [
                'VoiceLink is an Indian phone company: your agents call from, and answer, your own +91 numbers, on your own VoiceLink plan and bill.',
                'No account yet? Ask VoiceLink, or the reseller that sold you your numbers, to open one.',
            ],
            image: voicelinkImage(
                '1-voicelink-account.webp',
                'An illustration of the VoiceLink panel sign-in form, highlighted',
            ),
            link: { href: 'https://app.voicelink.co.in/', label: 'Open the VoiceLink panel' },
        },
        {
            id: VOICELINK_GUIDE_STEP.API_TOKEN,
            title: 'Create an API token and copy it',
            body: [
                'In the panel, open the API section and create a token. Name it something like “Aixel Labs” and copy it.',
                'Bought your numbers through a reseller? Note the client ID they belong to as well: the connect form asks for it.',
            ],
            image: voicelinkImage(
                '2-api-token.webp',
                'An illustration of the API section of the VoiceLink panel, with the Create token button and the new token highlighted',
            ),
        },
        {
            id: VOICELINK_GUIDE_STEP.NUMBER,
            title: 'Have a number (DID) in VoiceLink',
            body: [
                'Your numbers are listed under DIDs. No number yet? Ask VoiceLink, or your reseller, to assign one to your account.',
            ],
            image: voicelinkImage(
                '3-dids.webp',
                'An illustration of the DIDs list in the VoiceLink panel, with the numbers highlighted',
            ),
        },
        {
            id: VOICELINK_GUIDE_STEP.WEBSOCKET,
            title: 'Keep the “WebSocket API” switch off',
            body: [
                'When an agent starts using a number, we add a WebSocket bot named “Aixel Labs +91…” to your account (WebSocket Bots).',
                'Leave its “WebSocket API” switch off. With it on, calls are answered and dropped at once, and the API cannot change it for us.',
            ],
            image: voicelinkImage(
                '4-websocket-switch.webp',
                'An illustration of WebSocket Bots in the VoiceLink panel, with the WebSocket API switch of the Aixel Labs bot highlighted, off',
            ),
        },
        {
            id: VOICELINK_GUIDE_STEP.CONNECT,
            title: 'Paste the token here and pick your number',
            body: [
                'On this page, open Connect a number and choose VoiceLink. Paste the token (and the client ID on a reseller account), and click Find my numbers.',
                'Tick the numbers you want and import them. Importing changes nothing in VoiceLink: each number keeps ringing where it does.',
            ],
            image: voicelinkImage(
                '5-connect-in-aixel-labs.webp',
                'An illustration of the Connect a VoiceLink number dialog in Aixel Labs, with the token and client ID fields highlighted',
            ),
        },
        {
            id: VOICELINK_GUIDE_STEP.CHANGES,
            title: 'What Aixel Labs changes in your VoiceLink account',
            body: [
                'Each number has one routing rule with two halves: incoming and outgoing calls. An agent that answers calls takes only the incoming half; one that makes calls takes only the outgoing half. The other half stays as you set it.',
                'We save the rule before the first change. Unlink the number from the agent, or remove it, and that half goes back exactly as it was. Removing the number also switches our bot off.',
            ],
            image: voicelinkImage(
                '6-what-we-change.webp',
                'An illustration of a number’s routing rule in the VoiceLink panel, with the incoming half set to the Aixel Labs bot highlighted',
            ),
        },
    ],
};

const SETUP_GUIDES: Record<VoiceProvider, SetupGuide> = {
    [VoiceProvider.TELNYX]: TELNYX_GUIDE,
    [VoiceProvider.TWILIO]: TWILIO_GUIDE,
    [VoiceProvider.VOICELINK]: VOICELINK_GUIDE,
};

/** Every provider's step-by-step setup guide (the setup-guide spec opens each one). */
export function setupGuideFor(provider: VoiceProvider): SetupGuide {
    return SETUP_GUIDES[provider];
}
