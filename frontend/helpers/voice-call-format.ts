import {
    VoiceCallChannel,
    VoiceCallDirection,
    type VoiceCallSentiment,
    VoiceCallTest,
    type VoiceCallTurn,
} from '@aixellabs/backend/db/types';

/** Calls in words and numbers (Call logs, call detail, Analytics). */

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

const TEST_LABEL: Record<VoiceCallTest, string> = {
    [VoiceCallTest.BROWSER]: 'Browser test',
    [VoiceCallTest.SOFTPHONE]: 'Softphone test',
    [VoiceCallTest.REHEARSAL]: 'Outbound rehearsal',
};
const TEST_PARTY: Record<VoiceCallTest, string> = {
    [VoiceCallTest.BROWSER]: 'Browser',
    [VoiceCallTest.SOFTPHONE]: 'Softphone',
    [VoiceCallTest.REHEARSAL]: 'You',
};

/** One side of a phone call. On a test over the internet the SIP side (an address, "…@…") is named, not shown. */
export function formatParty(value: string | undefined, fallback: string, test?: VoiceCallTest | null): string {
    if (!value) return fallback;
    return test && value.includes('@') ? TEST_PARTY[test] : value;
}

/** The call log's tag for the owner's tests over the internet ("Browser test"…), else null. */
export function callTestLabel(call: { test?: VoiceCallTest | null }): string | null {
    return call.test ? TEST_LABEL[call.test] : null;
}

/** What the browser adds to an agent's SIP user, so Call logs tell its calls from the softphone's. */
const BROWSER_SUFFIX = '-browser';

/**
 * What reaches a number's inbound agent over SIP, like a call to the number. `tls`: the softphone sends the call over
 * TLS (port 5061) too; the subdomain has no SRV records, so without it the INVITE goes out on UDP 5060, which many
 * mobile networks block even when the softphone signed in over TLS.
 */
export function agentSipAddress(user: string, host: string, via: 'browser' | 'softphone', tls = false): string {
    return `sip:${user}${via === 'browser' ? BROWSER_SUFFIX : ''}@${host}${tls ? ';transport=tls' : ''}`;
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

/** A custom analysis field's value in words (null = the call did not say). */
export function formatFieldValue(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}
