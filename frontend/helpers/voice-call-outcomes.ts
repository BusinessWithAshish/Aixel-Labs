import { VoiceCallEndReason, VoiceCampaignOutcome, type VoiceCallSentiment } from '@aixellabs/backend/db/types';

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

/**
 * Good, so-so or bad: the one colour scale Call logs and Analytics share, so a reason, a verdict or
 * a mood is the same colour on a call card, a badge and a chart.
 */
export type OutcomeTone = 'good' | 'fair' | 'bad';

/** Chart fills and dots. */
export const TONE_COLORS: Record<OutcomeTone, string> = {
    good: 'var(--color-green-500)',
    fair: 'var(--color-amber-400)',
    bad: 'var(--color-red-500)',
};

/** Numbers written in the tone. */
export const TONE_TEXT: Record<OutcomeTone, string> = {
    good: 'text-green-700 dark:text-green-400',
    fair: 'text-amber-700 dark:text-amber-400',
    bad: 'text-red-700 dark:text-red-400',
};

export const TONE_BADGES = { good: 'green', fair: 'yellow', bad: 'red' } as const satisfies Record<OutcomeTone, string>;

const ENDED_BY_TONES: Record<VoiceCallEndReason, OutcomeTone> = {
    [VoiceCallEndReason.CALLER_HUNG_UP]: 'good',
    [VoiceCallEndReason.AGENT_HUNG_UP]: 'good',
    [VoiceCallEndReason.GOODBYE]: 'good',
    [VoiceCallEndReason.VOICEMAIL_MESSAGE]: 'good',
    [VoiceCallEndReason.DNC]: 'fair',
    [VoiceCallEndReason.VOICEMAIL]: 'fair',
    [VoiceCallEndReason.IVR]: 'fair',
    [VoiceCallEndReason.NO_ANSWER]: 'fair',
    [VoiceCallEndReason.RECORDING_OBJECTION]: 'fair',
    [VoiceCallEndReason.WRONG_NUMBER]: 'fair',
    [VoiceCallEndReason.BUSY]: 'fair',
    [VoiceCallEndReason.TIMEOUT]: 'fair',
    [VoiceCallEndReason.SILENCE]: 'fair',
    [VoiceCallEndReason.ABUSE]: 'bad',
    [VoiceCallEndReason.NOT_CONNECTED]: 'bad',
    [VoiceCallEndReason.FAILED]: 'bad',
    [VoiceCallEndReason.ERROR]: 'bad',
    [VoiceCallEndReason.GEMINI_KEY_ERROR]: 'bad',
};

/** A reason the engine added later counts as so-so until it is placed above. */
export function endedByTone(endedBy: string): OutcomeTone {
    return (ENDED_BY_TONES as Record<string, OutcomeTone>)[endedBy] ?? 'fair';
}

export function sentimentTone(sentiment: VoiceCallSentiment): OutcomeTone {
    return sentiment === 'positive' ? 'good' : sentiment === 'negative' ? 'bad' : 'fair';
}

/** How long the caller waited for an answer: under a second feels natural, over two drags. */
export function replyTone(ms: number): OutcomeTone {
    return ms < 1000 ? 'good' : ms < 2000 ? 'fair' : 'bad';
}

/** A share of calls that went well (answered, successful), 0–1. */
export function rateTone(rate: number): OutcomeTone {
    return rate >= 0.6 ? 'good' : rate >= 0.3 ? 'fair' : 'bad';
}
