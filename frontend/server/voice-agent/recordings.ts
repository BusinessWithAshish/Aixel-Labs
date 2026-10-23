import 'server-only';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    VoiceProvider,
    type VoiceNumberDoc,
    type VoiceCallDoc,
} from '@aixellabs/backend/db';
import { toObjectId } from '@/helpers/server-action-helpers';
import { findItem } from '@/server/voice-agent/accounts';
import { openSecret } from '@/server/voice-agent/engine';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import { listRecordingsForCall } from '@/server/voice-agent/telnyx';
import { listCallRecordings, recordingMediaUrl, twilioAuthorization } from '@/server/voice-agent/twilio';
import { twilioAuthOf } from '@/server/voice-agent/twilio-numbers';

/** What the page may see: the audio itself streams through the recording route, so no provider link. */
export type CallRecordingResult =
    | {
          available: true;
          format: 'mp3' | 'wav';
          durationSec: number | null;
          /** Whose account keeps the recording. */
          storedBy: VoiceProvider;
      }
    | { available: false; reason: string };

/**
 * What the recording route needs on top of what the page may see: the provider's link (Telnyx's
 * expires in minutes) and the `Authorization` header it wants (Twilio's media URLs need the account's credentials). Server only.
 */
export type CallRecordingSource =
    | (Extract<CallRecordingResult, { available: true }> & { url: string; authorization?: string })
    | Extract<CallRecordingResult, { available: false }>;

function recordingFormat(url: string): 'mp3' | 'wav' {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3';
    } catch {
        return 'mp3';
    }
}

/** The page's view of a source: never the link or the credentials. */
export function withoutCredentials(source: CallRecordingSource): CallRecordingResult {
    if (!source.available) return { available: false, reason: source.reason };
    const { format, durationSec, storedBy } = source;
    return { available: true, format, durationSec, storedBy };
}

async function twilioRecording(number: VoiceNumberDoc, callSid: string): Promise<CallRecordingSource> {
    const auth = twilioAuthOf(number);
    const recordings = await listCallRecordings(auth, callSid);
    const recording = recordings.find((r) => r.status === 'completed');
    if (!recording) {
        const pending = recordings.some((r) => ['in-progress', 'processing', 'paused', 'stopped'].includes(r.status));
        return {
            available: false,
            reason: pending
                ? 'Twilio is still processing the recording for this call. It usually arrives a minute or two after the call ends.'
                : 'Twilio has no recording for this call.',
        };
    }
    const seconds = Number(recording.duration);
    return {
        available: true,
        url: recordingMediaUrl(auth, recording.sid, 'mp3'),
        format: 'mp3',
        durationSec: Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
        storedBy: VoiceProvider.TWILIO,
        authorization: twilioAuthorization(auth),
    };
}

/**
 * The call's recording. VoiceLink hands its link over in the call.completed webhook, which the
 * engine stores on the call (`recordingUrl`). Telnyx links expire after a few minutes, so a fresh
 * one is asked for from the customer's own Telnyx account each time. Twilio's recordings are listed
 * by the call's CallSid in the customer's account; their audio needs the same credentials.
 */
export async function findCallRecording(owner: VoiceOwnerScope, call: VoiceCallDoc): Promise<CallRecordingSource> {
    if (call.recordingUrl) {
        return {
            available: true,
            url: call.recordingUrl,
            format: recordingFormat(call.recordingUrl),
            durationSec: call.durationSec || null,
            storedBy: VoiceProvider.VOICELINK,
        };
    }
    if (!call.numberId) {
        return { available: false, reason: 'This call was not placed through a phone number, so there is no recording.' };
    }

    const number = await findItem('numbers', { _id: call.numberId }, owner.userId);
    if (number?.provider === VoiceProvider.VOICELINK) {
        return {
            available: false,
            reason: 'VoiceLink has not sent the recording for this call yet. It usually arrives a minute or two after the call ends.',
        };
    }
    const providerName = number?.provider === VoiceProvider.TWILIO ? 'Twilio' : 'Telnyx';
    if (!call.providerCallId) {
        return { available: false, reason: `This call was not placed through ${providerName}, so there is no recording.` };
    }
    if (!number) {
        return {
            available: false,
            reason: 'The number this call used has been removed, so its recording cannot be fetched.',
        };
    }
    if (number.provider === VoiceProvider.TWILIO) return twilioRecording(number, call.providerCallId);

    const recordings = await listRecordingsForCall(openSecret(number.apiKeySealed), call.providerCallId);
    const recording = recordings.find((r) => r.status === 'completed' && (r.download_urls?.mp3 || r.download_urls?.wav));
    if (!recording?.download_urls) {
        return { available: false, reason: 'Telnyx has no recording for this call.' };
    }
    const durationSec = recording.duration_millis ? Math.round(recording.duration_millis / 1000) : null;
    if (recording.download_urls.mp3) {
        return {
            available: true,
            url: recording.download_urls.mp3,
            format: 'mp3',
            durationSec,
            storedBy: VoiceProvider.TELNYX,
        };
    }
    return {
        available: true,
        url: recording.download_urls.wav ?? '',
        format: 'wav',
        durationSec,
        storedBy: VoiceProvider.TELNYX,
    };
}

/** The signed-in user's call, or null when it is not theirs. */
async function findOwnedCall(owner: VoiceOwnerScope, callId: string): Promise<VoiceCallDoc | null> {
    const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    return calls.findOne({ _id: toObjectId(callId, 'Call ID'), userId: owner.userId });
}

/** For the recording route: the caller's call and where its audio is, credentials included. */
export async function findOwnedCallRecording(userId: string, callId: string): Promise<CallRecordingSource> {
    const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.CALL_LOGS);
    const call = await findOwnedCall(owner, callId);
    if (!call) throw new Error('Call not found');
    return findCallRecording(owner, call);
}
