import 'server-only';

import { VoiceProvider, type MongoObjectId, type VoiceNumberDoc } from '@aixellabs/backend/db';
import { telnyxNumbers } from '@/server/voice-agent/telnyx-numbers';
import { twilioNumbers } from '@/server/voice-agent/twilio-numbers';
import { voicelinkNumbers } from '@/server/voice-agent/voicelink-numbers';

export type OwnedNumberDoc = VoiceNumberDoc & { _id: MongoObjectId };

/** A number in the customer's provider account, as offered for import. */
export type ProviderAccountNumber = {
    providerNumberId: string;
    phoneNumber: string;
    status: string;
};

/**
 * What changes in the customer's provider account when a number's setup changes. The server
 * actions own auth, agents and our own fields; each provider owns its side and the fields that
 * only it uses. `doc` is the number as it is before the change; when a number switches jobs, the
 * old job is stopped (and its agent cleared on `doc`) before the new one starts.
 */
export type NumberProvider = {
    /** Shown in messages, e.g. "Telnyx". */
    label: string;
    /** The number starts answering calls: send its incoming calls to the engine. */
    startAnswering(doc: OwnedNumberDoc): Promise<void>;
    /** The number stops answering calls: incoming calls ring wherever they did before. */
    stopAnswering(doc: OwnedNumberDoc): Promise<void>;
    /** The number starts placing calls (an outbound agent is set). */
    startPlacingCalls(doc: OwnedNumberDoc): Promise<void>;
    /** The number stops placing calls (its outbound agent is cleared). */
    stopPlacingCalls(doc: OwnedNumberDoc): Promise<void>;
    /** Right before the engine places a call from the number. */
    prepareCall(doc: OwnedNumberDoc): Promise<void>;
    /** Before the number is forgotten: undo what we changed. Throws to keep the number. */
    release(doc: OwnedNumberDoc): Promise<void>;
};

const PROVIDERS: Record<VoiceProvider, NumberProvider> = {
    [VoiceProvider.TELNYX]: telnyxNumbers,
    [VoiceProvider.VOICELINK]: voicelinkNumbers,
    [VoiceProvider.TWILIO]: twilioNumbers,
};

export function providerOf(doc: VoiceNumberDoc): NumberProvider {
    return PROVIDERS[doc.provider] ?? telnyxNumbers;
}
