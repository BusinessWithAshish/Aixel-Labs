import { VoiceCallEndReason, VoiceCampaignOutcome } from '@aixellabs/backend/db/types';

/** How calls and campaign contacts ended, in words (Call logs, call detail, campaign contacts). */

const ENDED_BY_LABELS: Record<VoiceCallEndReason, string> = {
    [VoiceCallEndReason.CALLER_HUNG_UP]: 'Caller hung up',
    [VoiceCallEndReason.AGENT_HUNG_UP]: 'Agent hung up',
    [VoiceCallEndReason.GOODBYE]: 'Said goodbye',
    [VoiceCallEndReason.DNC]: 'Asked not to be called',
    [VoiceCallEndReason.ABUSE]: 'Abusive caller',
    [VoiceCallEndReason.VOICEMAIL]: 'Voicemail',
    [VoiceCallEndReason.VOICEMAIL_MESSAGE]: 'Left a voicemail',
    [VoiceCallEndReason.IVR]: 'Phone menu',
    [VoiceCallEndReason.NO_ANSWER]: 'No answer',
    [VoiceCallEndReason.NOT_CONNECTED]: 'Audio never connected',
    [VoiceCallEndReason.RECORDING_OBJECTION]: 'Objected to recording',
    [VoiceCallEndReason.WRONG_NUMBER]: 'Wrong number',
    [VoiceCallEndReason.BUSY]: 'Busy',
    [VoiceCallEndReason.FAILED]: 'Failed',
    [VoiceCallEndReason.TIMEOUT]: 'Time limit',
    [VoiceCallEndReason.ERROR]: 'Error',
    [VoiceCallEndReason.GEMINI_KEY_ERROR]: 'Gemini key problem',
    [VoiceCallEndReason.SILENCE]: 'Caller went quiet',
};

/** Known reasons in words; anything new from the engine is shown as it was written. */
export function endedByLabel(endedBy: string): string {
    return (ENDED_BY_LABELS as Record<string, string>)[endedBy] ?? (endedBy || 'Unknown');
}

const OUTCOME_LABELS: Record<VoiceCampaignOutcome, string> = {
    [VoiceCampaignOutcome.DNC_LIST]: 'On the do-not-call list',
    [VoiceCampaignOutcome.INVALID_NUMBER]: 'Not a valid number',
    [VoiceCampaignOutcome.INTERRUPTED]: 'Interrupted',
};

/** A contact's last outcome in words: a campaign outcome, else how its last call ended. */
export function outcomeLabel(outcome: string | null): string | null {
    if (!outcome) return null;
    return (OUTCOME_LABELS as Record<string, string>)[outcome] ?? endedByLabel(outcome);
}
