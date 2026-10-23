'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PhoneCall } from 'lucide-react';
import { getVoiceAgentOptions, type VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { listMyNumbers, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { TestCallDialog } from '@/components/common/voice-agent/TestCallDialog';
import { Button } from '@/components/ui/button';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** The agent rings the owner's phone, from a number it is on when it has one. */
export function AgentTestCallButton() {
    const { agentId, usage, geminiKey } = usePage<UseVoiceAgentEditorPageReturn>();
    const [loading, setLoading] = useState(false);
    const [testCall, setTestCall] = useState<{ numbers: VoiceNumberListItem[]; agents: VoiceAgentOption[] } | null>(null);

    const open = async () => {
        setLoading(true);
        const [numbersRes, agentsRes] = await Promise.all([listMyNumbers(), getVoiceAgentOptions()]);
        setLoading(false);
        if (!numbersRes.data || !agentsRes.data) {
            toast.error(numbersRes.error ?? agentsRes.error ?? 'Could not open the test call');
            return;
        }
        setTestCall({ numbers: numbersRes.data, agents: agentsRes.data.filter((a) => a.id === agentId) });
    };

    return (
        <>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void open()}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
                Test call
            </Button>
            {testCall ? (
                <TestCallDialog
                    open
                    onOpenChange={(next) => !next && setTestCall(null)}
                    numbers={testCall.numbers}
                    agents={testCall.agents}
                    geminiKey={geminiKey}
                    numberId={usage.outbound[0]?.id ?? usage.inbound[0]?.id}
                />
            ) : null}
        </>
    );
}
