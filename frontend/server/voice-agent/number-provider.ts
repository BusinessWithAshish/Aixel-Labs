import 'server-only';

import type { MongoObjectId, VoiceNumberDoc } from '@aixellabs/backend/db';

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
 * only it uses. `doc` is the number as it is before the change.
 */
export type NumberProvider = {
    /** Shown in messages, e.g. "Telnyx". */
    label: string;
    /** AI answering goes on: send the number's incoming calls to the engine. */
    startAnswering(doc: OwnedNumberDoc): Promise<void>;
    /** AI answering goes off: incoming calls ring wherever they did before. */
    stopAnswering(doc: OwnedNumberDoc): Promise<void>;
    /** An outbound agent is set or changed. */
    startPlacingCalls(doc: OwnedNumberDoc): Promise<void>;
    /** The outbound agent is cleared. */
    stopPlacingCalls(doc: OwnedNumberDoc): Promise<void>;
    /** Right before the engine places a call from the number. */
    prepareCall(doc: OwnedNumberDoc): Promise<void>;
    /** Before the number is forgotten: undo what we changed. Throws to keep the number. */
    release(doc: OwnedNumberDoc): Promise<void>;
};
