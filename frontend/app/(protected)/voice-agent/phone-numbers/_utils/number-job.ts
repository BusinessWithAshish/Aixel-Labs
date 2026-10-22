import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { numberProviderInfo } from '@/helpers/voice-number-providers';

/**
 * What a number does: answers calls, makes calls, or nothing yet. `null` = numbers set up before a
 * number did one job only, with both an answering and a calling agent, until the owner picks one.
 */
export type NumberJob = VoiceAgentCallType | 'NONE';

export function numberJob(number: VoiceNumberListItem): NumberJob | null {
    if (number.inboundAgentId && number.outboundAgentId) return null;
    if (number.inboundAgentId) return VoiceAgentCallType.INBOUND;
    if (number.outboundAgentId) return VoiceAgentCallType.OUTBOUND;
    return 'NONE';
}

/** The number's agent for `job`, if it has one. */
export function jobAgentId(number: VoiceNumberListItem, job: NumberJob | null): string | null {
    if (job === VoiceAgentCallType.INBOUND) return number.inboundAgentId ?? null;
    if (job === VoiceAgentCallType.OUTBOUND) return number.outboundAgentId ?? null;
    return null;
}

/** An agent's name: from the list, else the one stored with the number (a deleted agent's). */
export function agentName(number: VoiceNumberListItem, agents: VoiceAgentOption[], agentId: string | null): string {
    const listed = agents.find((a) => a.id === agentId)?.name;
    if (listed) return listed;
    if (agentId && agentId === number.inboundAgentId && number.inboundAgentName) return number.inboundAgentName;
    if (agentId && agentId === number.outboundAgentId && number.outboundAgentName) return number.outboundAgentName;
    return 'a deleted agent';
}

export type NumberBadge = { label: string; variant: 'green' | 'blue' | 'secondary' | 'yellow' };

/** What the number does today, in the words the row shows. */
export function numberBadge(job: NumberJob | null): NumberBadge {
    switch (job) {
        case VoiceAgentCallType.INBOUND:
            return { label: 'Answers calls', variant: 'green' };
        case VoiceAgentCallType.OUTBOUND:
            return { label: 'Makes calls', variant: 'blue' };
        case 'NONE':
            return { label: 'Not used yet', variant: 'secondary' };
        default:
            return { label: 'Pick one job', variant: 'yellow' };
    }
}

/** What a number doing `job` with `agent` means for callers, in one sentence. */
export function jobSummary(job: NumberJob, agent: string, phoneNumber: string): string {
    if (job === VoiceAgentCallType.INBOUND) return `When someone calls ${phoneNumber}, ${agent} picks up and talks to them.`;
    if (job === VoiceAgentCallType.OUTBOUND) {
        return `${agent} makes the calls you start from ${phoneNumber}. People who call it reach you the way they always have.`;
    }
    return `The AI does nothing with ${phoneNumber}. Calls to it ring the way they always have.`;
}

/** One `setNumberAgent` call of a change, with what it does in plain words. */
export type JobStep = { title: string; callType: VoiceAgentCallType | null; agentId: string | null };

/**
 * The server calls that take a number from its job to `job` with `agentId`, one per visible step,
 * so the dialog shows real progress. Switching jobs stops the old one first (a call with no job),
 * then sets up the new one. Empty when nothing would change.
 */
export function planJobChange(
    number: VoiceNumberListItem,
    agents: VoiceAgentOption[],
    job: NumberJob,
    agentId: string | null,
): JobStep[] {
    const provider = numberProviderInfo(number.provider).label;
    const current = numberJob(number);
    const stopAnswering = `Stop answering calls. ${provider} sends them back to where they rang before.`;
    const stopCalling = 'Stop making calls from this number.';

    if (job === 'NONE') {
        if (current === 'NONE') return [];
        const title =
            current === VoiceAgentCallType.INBOUND
                ? stopAnswering
                : current === VoiceAgentCallType.OUTBOUND
                  ? stopCalling
                  : `Stop making calls, and stop answering them. ${provider} sends calls back to where they rang before.`;
        return [{ title, callType: null, agentId: null }];
    }

    const name = agentName(number, agents, agentId);
    const kept = jobAgentId(number, job);
    const steps: JobStep[] = [];
    if (current !== job && current !== 'NONE') {
        // A number with both jobs that keeps this one drops only the other, in the same call.
        if (kept)
            steps.push({
                title: job === VoiceAgentCallType.INBOUND ? stopCalling : stopAnswering,
                callType: job,
                agentId: kept,
            });
        else
            steps.push({
                title: current === VoiceAgentCallType.INBOUND ? stopAnswering : stopCalling,
                callType: null,
                agentId: null,
            });
    }
    if (!kept) {
        steps.push({
            title:
                job === VoiceAgentCallType.INBOUND
                    ? `Set up ${provider} so ${name} answers calls to this number.`
                    : `Let ${name} make calls from this number.`,
            callType: job,
            agentId,
        });
    } else if (kept !== agentId) {
        steps.push({ title: `Switch to ${name}. Nothing changes in ${provider}.`, callType: job, agentId });
    }
    return steps;
}
