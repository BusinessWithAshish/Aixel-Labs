'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PhoneCall } from 'lucide-react';
import { getVoiceAgentOptions, type VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { TestCallDialog } from '@/components/common/voice-agent/TestCallDialog';
import { DisabledReason } from '@/components/wrappers/DisabledReason';
import { Button } from '@/components/ui/button';
import { blockerText } from '@/helpers/voice-call-readiness';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** The agent rings the owner's phone, from a number it is on when it has one. Green: the card's one call to try it out. */
export function AgentTestCallButton() {
    const { agentId, usage, ownedNumbers, geminiKey, phoneBlockers } = usePage<UseVoiceAgentEditorPageReturn>();
    const [loading, setLoading] = useState(false);
    const [agents, setAgents] = useState<VoiceAgentOption[] | null>(null);

    const open = async () => {
        setLoading(true);
        const response = await getVoiceAgentOptions();
        setLoading(false);
        if (!response.data) {
            toast.error(response.error ?? 'Could not open the test call');
            return;
        }
        setAgents(response.data.filter((a) => a.id === agentId));
    };

    return (
        <>
            <DisabledReason reason={phoneBlockers.length ? blockerText(phoneBlockers) : null}>
                <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    disabled={loading || phoneBlockers.length > 0}
                    onClick={() => void open()}
                >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
                    Test call
                </Button>
            </DisabledReason>
            {agents ? (
                <TestCallDialog
                    open
                    onOpenChange={(next) => !next && setAgents(null)}
                    numbers={ownedNumbers}
                    agents={agents}
                    geminiKey={geminiKey}
                    numberId={usage.outbound[0]?.id ?? usage.inbound[0]?.id}
                />
            ) : null}
        </>
    );
}
