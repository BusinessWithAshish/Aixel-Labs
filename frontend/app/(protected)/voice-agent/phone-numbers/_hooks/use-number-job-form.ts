'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { setNumberAgent, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { usePage } from '@/contexts/PageStore';
import { numberJobSchema, type NumberJobFormValues } from '@/helpers/voice-schemas';
import { agentName, jobAgentId, numberJob, planJobChange, type JobStep, type NumberJob } from '../_utils/number-job';
import type { UsePhoneNumbersPageReturn } from './use-phone-numbers-page';

/** A change being saved: its steps, how many finished, and why the next one failed (if it did). */
export type JobRun = { steps: JobStep[]; done: number; error: string | null; job: NumberJob; agentName: string };

/** The Change dialog of one number: pick a job and agent, preview the steps, then run them one server call at a time. */
export function useNumberJobForm(number: VoiceNumberListItem) {
    const { agents, inboundAgents, outboundAgents, hasGeminiKey, replaceNumber } = usePage<UsePhoneNumbersPageReturn>();
    const [run, setRun] = useState<JobRun | null>(null);

    /** The number's own agent for `job`, else the first agent made for it. */
    const agentFor = (job: NumberJob) =>
        job === 'NONE'
            ? ''
            : (jobAgentId(number, job) ??
              (job === VoiceAgentCallType.INBOUND ? inboundAgents : outboundAgents)[0]?.id ??
              '');

    // A number with both jobs starts on answering, its first job.
    const startJob = numberJob(number) ?? VoiceAgentCallType.INBOUND;
    const form = useForm<NumberJobFormValues>({
        resolver: zodResolver(numberJobSchema),
        defaultValues: { job: startJob, agentId: agentFor(startJob) },
    });
    const job = form.watch('job');
    const agentId = form.watch('agentId');

    const canAnswer = !!number.inboundAgentId || (hasGeminiKey && inboundAgents.length > 0);
    const canCall = !!number.outboundAgentId || (hasGeminiKey && outboundAgents.length > 0);
    const steps = planJobChange(number, agents, job, job === 'NONE' ? null : agentId || null);
    /** Choosing an agent needs the Gemini key; the server refuses without it. */
    const blockedByKey = !hasGeminiKey && job !== 'NONE' && steps.length > 0;
    const running = run !== null && run.error === null && run.done < run.steps.length;

    const chooseJob = (next: NumberJob) => {
        form.setValue('job', next);
        form.setValue('agentId', agentFor(next), { shouldValidate: form.formState.isSubmitted });
    };

    const own = jobAgentId(number, job);
    const listed =
        job === VoiceAgentCallType.INBOUND ? inboundAgents : job === VoiceAgentCallType.OUTBOUND ? outboundAgents : [];
    const agentOptions = [
        ...listed.map((a) => ({ value: a.id, label: a.name })),
        // Its current agent when it is no longer listed (deleted, or made for the other kind of call).
        ...(own && !listed.some((a) => a.id === own) ? [{ value: own, label: agentName(number, agents, own) }] : []),
    ];

    /** Something changes, and the agent (when the job needs one) is one of this job's options. */
    const canSave = steps.length > 0 && !blockedByKey && (job === 'NONE' || agentOptions.some((o) => o.value === agentId));

    const save = form.handleSubmit(async (values) => {
        if (!number._id || !canSave) return;
        const plan = planJobChange(number, agents, values.job, values.job === 'NONE' ? null : values.agentId);
        if (plan.length === 0) return;
        const name = agentName(number, agents, values.agentId);
        setRun({ steps: plan, done: 0, error: null, job: values.job, agentName: name });
        for (const [i, step] of plan.entries()) {
            // A dropped connection rejects instead of answering; it must not leave the dialog stuck on "Working…".
            const res = await setNumberAgent(number._id, step.callType, step.agentId).catch(() => null);
            if (!res?.success || !res.data) {
                const error = res?.error ?? 'We could not reach the server. Check your connection and try again.';
                setRun((prev) => prev && { ...prev, done: i, error });
                return;
            }
            replaceNumber(res.data);
            setRun((prev) => prev && { ...prev, done: i + 1 });
        }
    });

    return {
        form,
        job,
        agentId,
        steps,
        run,
        running,
        blockedByKey,
        canAnswer,
        canCall,
        agentOptions,
        canSave,
        chooseJob,
        save,
        /** Back to the form after a failure; the preview now starts from where the number stands. */
        editAgain: () => setRun(null),
    };
}

export type UseNumberJobFormReturn = ReturnType<typeof useNumberJobForm>;
