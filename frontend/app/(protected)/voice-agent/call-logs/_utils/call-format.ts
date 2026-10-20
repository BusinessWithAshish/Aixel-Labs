import {
    VoiceCallChannel,
    VoiceCallDirection,
    type VoiceCallSentiment,
    type VoiceCallTurn,
} from '@aixellabs/backend/db/types';

const ENDED_BY_LABELS: Record<string, string> = {
    caller_hung_up: 'Caller hung up',
    agent_hung_up: 'Agent hung up',
    goodbye: 'Said goodbye',
    dnc: 'Asked not to be called',
    abuse: 'Abusive caller',
    voicemail: 'Voicemail',
    voicemail_message: 'Left a voicemail',
    ivr: 'Phone menu',
    no_answer: 'No answer',
    not_connected: 'Audio never connected',
    recording_objection: 'Objected to recording',
    wrong_number: 'Wrong number',
    busy: 'Busy',
    failed: 'Failed',
    timeout: 'Time limit',
    error: 'Error',
    gemini_key_error: 'Gemini key problem',
};

/** Known reasons in words; anything new from the engine is shown as it was written. */
export function endedByLabel(endedBy: string): string {
    return ENDED_BY_LABELS[endedBy] ?? (endedBy || 'Unknown');
}

export function callTypeLabel(channel: VoiceCallChannel, direction: VoiceCallDirection): string {
    if (channel === VoiceCallChannel.PLAYGROUND || direction === VoiceCallDirection.PLAYGROUND) return 'Playground';
    return direction === VoiceCallDirection.INBOUND ? 'Inbound' : 'Outbound';
}

export function callTypeVariant(channel: VoiceCallChannel, direction: VoiceCallDirection): 'purple' | 'blue' | 'green' {
    if (channel === VoiceCallChannel.PLAYGROUND || direction === VoiceCallDirection.PLAYGROUND) return 'purple';
    return direction === VoiceCallDirection.INBOUND ? 'green' : 'blue';
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(totalSec: number): string {
    const sec = Math.max(0, Math.round(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function formatGap(ms: number | null): string {
    if (ms === null) return '—';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function formatParty(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    return value.replace(/^sip:/, '');
}

/** The engine can log one utterance as several same-role fragments; show them as one bubble. */
export function mergeTurns(turns: VoiceCallTurn[]): VoiceCallTurn[] {
    const merged: VoiceCallTurn[] = [];
    for (const turn of turns) {
        const last = merged[merged.length - 1];
        if (last && last.role === turn.role)
            merged[merged.length - 1] = { ...last, text: `${last.text} ${turn.text}`.trim() };
        else merged.push({ ...turn });
    }
    return merged;
}

/**
 * Pairs each gap with the agent turn it preceded: a gap is measured when the caller stops and
 * the agent answers, so it belongs to an agent turn that follows a caller turn, in order.
 */
export function gapsByTurn(turns: VoiceCallTurn[], gapsMs: number[]): (number | null)[] {
    let next = 0;
    return turns.map((turn, index) => {
        const answersCaller = turn.role === 'agent' && index > 0 && turns[index - 1].role === 'caller';
        if (!answersCaller || next >= gapsMs.length) return null;
        return gapsMs[next++];
    });
}

export const SENTIMENT_LABELS: Record<VoiceCallSentiment, string> = {
    positive: 'Positive',
    neutral: 'Neutral',
    negative: 'Negative',
};

export function sentimentVariant(sentiment: VoiceCallSentiment): 'green' | 'yellow' | 'red' {
    return sentiment === 'positive' ? 'green' : sentiment === 'negative' ? 'red' : 'yellow';
}

/** A custom analysis field's value in words (null = the call did not say). */
export function formatFieldValue(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}
