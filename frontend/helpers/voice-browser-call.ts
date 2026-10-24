import { VoiceProvider } from '@aixellabs/backend/db/types';
import type { Call as TwilioSdkCall } from '@twilio/voice-sdk';
import type { WebPhoneSession } from '@/server/voice-agent/web-phone';

/** How the call ended. `sipCode` / `cause` come from Telnyx only; `error` is already in plain words. */
export type BrowserCallEnd = {
    answered: boolean;
    sipCode?: number | null;
    cause?: string | null;
    error?: string | null;
};

export type BrowserCallEvents = {
    onRinging: () => void;
    onAnswered: () => void;
    onEnded: (end: BrowserCallEnd) => void;
};

/** A call in progress, the same for every provider. */
export type BrowserCall = {
    hangup: () => void;
    setMuted: (muted: boolean) => void;
    sendDigit: (digit: string) => void;
};

type TelnyxSession = Extract<WebPhoneSession, { provider: VoiceProvider.TELNYX }>;

/** The SDKs touch `window` when loaded, so they are only imported when a call starts. E2E specs stand one in. */
async function telnyxClient(session: TelnyxSession) {
    const fake = (window as { __e2eTelnyxRTC?: typeof import('@telnyx/webrtc').TelnyxRTC }).__e2eTelnyxRTC;
    const TelnyxRTC = fake ?? (await import('@telnyx/webrtc')).TelnyxRTC;
    return new TelnyxRTC({ login_token: session.loginToken });
}

/** `to` is a phone number (E.164) or a SIP URI (an agent's test address); only a phone number gets the caller ID. */
async function telnyxCall(session: TelnyxSession, to: string, events: BrowserCallEvents): Promise<BrowserCall> {
    const client = await telnyxClient(session);
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    let answered = false;
    let ended = false;
    const finish = (end: Omit<BrowserCallEnd, 'answered'>) => {
        if (ended) return;
        ended = true;
        remoteAudio.srcObject = null;
        void client.disconnect();
        events.onEnded({ answered, ...end });
    };

    return new Promise<BrowserCall>((resolve, reject) => {
        let started = false;
        client.on('telnyx.error', () => {
            const error = 'Telnyx would not connect the browser phone. Try again in a moment.';
            if (started) finish({ error });
            else {
                void client.disconnect();
                reject(new Error(error));
            }
        });
        client.on('telnyx.ready', () => {
            if (started) return;
            started = true;
            const call = client.newCall({
                destinationNumber: to,
                ...(to.startsWith('sip:') ? {} : { callerNumber: session.callerNumber }),
                audio: true,
                video: false,
                remoteElement: remoteAudio,
            });
            resolve({
                hangup: () => void call.hangup(),
                setMuted: (muted) => (muted ? call.muteAudio() : call.unmuteAudio()),
                sendDigit: (digit) => call.dtmf(digit),
            });
        });
        client.on(
            'telnyx.notification',
            (notification: { type: string; call?: { state: string; sipCode?: number; cause?: string } }) => {
                const call = notification.call;
                if (notification.type !== 'callUpdate' || !call) return;
                if (call.state === 'ringing' || call.state === 'early') events.onRinging();
                if (call.state === 'active' && !answered) {
                    answered = true;
                    events.onAnswered();
                }
                if (call.state === 'hangup' || call.state === 'destroy')
                    finish({ sipCode: call.sipCode, cause: call.cause });
            },
        );
        void client.connect();
    });
}

type TwilioSdkError = { code?: number; message?: string };

/** Twilio's error codes the owner can act on (twilio.com/docs/api/errors). */
function twilioErrorMessage(error: TwilioSdkError): string {
    if (error.code === 20101 || error.code === 20104 || error.code === 31204 || error.code === 31205) {
        return 'Twilio refused the browser phone’s sign-in. Check the API key is still active in the Twilio Console.';
    }
    if (error.code === 31208 || error.code === 31401) return 'Allow this site to use your microphone, then call again.';
    return `Twilio could not place the call${error.message ? ` (${error.message})` : ''}.`;
}

async function twilioCall(
    session: Extract<WebPhoneSession, { provider: VoiceProvider.TWILIO }>,
    to: string,
    events: BrowserCallEvents,
): Promise<BrowserCall> {
    const { Device } = await import('@twilio/voice-sdk');
    const device = new Device(session.accessToken, { closeProtection: true });
    let answered = false;
    let ended = false;
    const finish = (error?: string) => {
        if (ended) return;
        ended = true;
        device.destroy();
        events.onEnded({ answered, error });
    };
    device.on('error', (error) => finish(twilioErrorMessage(error)));

    let call: TwilioSdkCall;
    try {
        call = await device.connect({ params: { ...session.params, To: to } });
    } catch (error) {
        device.destroy();
        throw new Error(twilioErrorMessage(error as TwilioSdkError));
    }
    // The TwiML dials with answerOnBridge, so "accept" means the other side picked up.
    call.on('ringing', () => events.onRinging());
    call.on('accept', () => {
        answered = true;
        events.onAnswered();
    });
    call.on('disconnect', () => finish());
    call.on('error', (error: TwilioSdkError) => finish(twilioErrorMessage(error)));
    return {
        hangup: () => call.disconnect(),
        setMuted: (muted) => call.mute(muted),
        sendDigit: (digit) => call.sendDigits(digit),
    };
}

/** The call ringing this browser, until it is answered or declined. */
export type IncomingBrowserCall = { answer: () => void; decline: () => void };

/**
 * Signs the browser in and waits for one call. Resolves once Telnyx is ready to ring it (only then may the agent
 * dial); `onIncoming` hands over Answer / Decline, the rest is as for a call placed here.
 */
export async function waitForBrowserCall(
    session: WebPhoneSession,
    events: BrowserCallEvents & { onIncoming: (call: IncomingBrowserCall) => void },
): Promise<BrowserCall> {
    if (session.provider !== VoiceProvider.TELNYX) throw new Error('Only a Telnyx number can ring this browser for now.');
    const client = await telnyxClient(session);
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    client.remoteElement = remoteAudio;
    type SdkCall = {
        id: string;
        state: string;
        direction?: string;
        sipCode?: number;
        cause?: string;
        answer: () => Promise<void>;
        hangup: () => void;
        muteAudio: () => void;
        unmuteAudio: () => void;
        dtmf: (digit: string) => void;
    };
    let current: SdkCall | null = null;
    let answered = false;
    let ended = false;
    const finish = (end: Omit<BrowserCallEnd, 'answered'>) => {
        if (ended) return;
        ended = true;
        remoteAudio.srcObject = null;
        void client.disconnect();
        events.onEnded({ answered, ...end });
    };
    client.on('telnyx.notification', (notification: { type: string; call?: SdkCall }) => {
        const call = notification.call;
        if (notification.type !== 'callUpdate' || !call || (current && call.id !== current.id)) return;
        if (!current && call.direction === 'inbound' && call.state === 'ringing') {
            current = call;
            events.onRinging();
            events.onIncoming({ answer: () => void call.answer(), decline: () => call.hangup() });
        }
        if (current && call.state === 'active' && !answered) {
            answered = true;
            events.onAnswered();
        }
        if (current && (call.state === 'hangup' || call.state === 'destroy'))
            finish({ sipCode: call.sipCode, cause: call.cause });
    });
    await new Promise<void>((resolve, reject) => {
        client.on('telnyx.ready', () => resolve());
        client.on('telnyx.error', () => {
            const error = 'Telnyx would not connect the browser phone. Try again in a moment.';
            if (current) finish({ error });
            else {
                void client.disconnect();
                reject(new Error(error));
            }
        });
        void client.connect();
    });
    return {
        hangup: () => (current ? current.hangup() : finish({})),
        setMuted: (muted) => (muted ? current?.muteAudio() : current?.unmuteAudio()),
        sendDigit: (digit) => current?.dtmf(digit),
    };
}

/** Fetches a provider's phone code ahead of the call (the browser keeps it for `placeBrowserCall`). */
export function preloadBrowserPhone(provider: VoiceProvider) {
    if (provider === VoiceProvider.TWILIO) void import('@twilio/voice-sdk').catch(() => {});
    else if (provider === VoiceProvider.TELNYX) void import('@telnyx/webrtc').catch(() => {});
}

/** Rings `to` from the session's number; resolves once the call is placed. */
export function placeBrowserCall(session: WebPhoneSession, to: string, events: BrowserCallEvents): Promise<BrowserCall> {
    return session.provider === VoiceProvider.TWILIO ? twilioCall(session, to, events) : telnyxCall(session, to, events);
}
