'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { VoiceCallChannel, type VoiceCallerMemory } from '@aixellabs/backend/db/types';
import { getCallRecordingUrl, type CallRecordingResult, type VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { forgetVoiceCallerMemory } from '@/app/actions/voice-caller-memory-actions';
import { gapsByTurn, median, mergeTurns } from '@/helpers/voice-call-format';
import { placeToolCalls } from '@/helpers/voice-tool-calls';

export type RecordingState =
    { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'done' } & CallRecordingResult);

export type CallDetailData = {
    call: VoiceCallListItem;
    /** What the call's agent remembers now about the other person (caller memory), if anything. */
    memory: VoiceCallerMemory | null;
};

export function useCallDetailPage({ call, memory: initialMemory }: CallDetailData) {
    // A VoiceLink call carries its recording link; a Telnyx or Twilio call is looked up by its call id.
    const hasProviderCall = call.hasRecording || (!!call.providerCallId && !!call.numberId);
    const [recording, setRecording] = useState<RecordingState>(
        hasProviderCall
            ? { status: 'loading' }
            : {
                  status: 'done',
                  available: false,
                  reason:
                      call.channel === VoiceCallChannel.PLAYGROUND
                          ? 'Playground calls are not recorded.'
                          : 'This call has no phone-provider call id, so there is no recording to fetch.',
              },
    );

    // Telnyx download links expire within minutes (Twilio's need credentials), so ask when the page opens.
    useEffect(() => {
        if (!hasProviderCall || !call._id) return;
        let cancelled = false;
        getCallRecordingUrl(call._id).then((res) => {
            if (cancelled) return;
            if (res.success && res.data) setRecording({ status: 'done', ...res.data });
            else setRecording({ status: 'error', message: res.error ?? 'Could not fetch the recording' });
        });
        return () => {
            cancelled = true;
        };
    }, [call._id, hasProviderCall]);

    const turns = useMemo(() => mergeTurns(call.turns), [call.turns]);
    const turnGaps = useMemo(() => gapsByTurn(turns, call.gapsMs), [turns, call.gapsMs]);
    /** Tool runs keyed by the bubble they follow (-1: before the first). */
    const toolsByTurn = useMemo(() => placeToolCalls(call.turns, call.toolCalls), [call.turns, call.toolCalls]);
    const gapStats = useMemo(
        () => ({
            median: median(call.gapsMs),
            max: call.gapsMs.length ? Math.max(...call.gapsMs) : null,
            count: call.gapsMs.length,
        }),
        [call.gapsMs],
    );

    const [memory, setMemory] = useState<VoiceCallerMemory | null>(initialMemory);
    const [forgetting, setForgetting] = useState(false);
    /** Forgets the caller: the agent's next call with this number starts knowing nothing about them. */
    const forgetCaller = useCallback(async (): Promise<boolean> => {
        if (!memory?._id) return true;
        setForgetting(true);
        const res = await forgetVoiceCallerMemory(memory._id);
        setForgetting(false);
        if (!res.success) {
            toast.error(res.error ?? 'Could not forget the caller');
            return false;
        }
        setMemory(null);
        toast.success(`Forgot ${memory.phone}`);
        return true;
    }, [memory]);

    return { call, turns, recording, turnGaps, toolsByTurn, gapStats, memory, forgetting, forgetCaller };
}

export type UseCallDetailPageReturn = ReturnType<typeof useCallDetailPage>;
