'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { getVoiceAgentOptions, type VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { PhoneNumberLine } from '@/components/common/voice-agent/PhoneNumberSelect';
import { TestCallPanel } from '@/components/common/voice-agent/TestCallDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/**
 * From (or on) your phone, over the phone network: an inbound agent's numbers to dial, and the test call (the agent
 * rings the owner's phone; an inbound agent talks as if they had called in). International rates and trial limits
 * apply, which is why the browser and Linphone tabs come first.
 */
export function PhoneTestPanel({ agentId, agentName, inbound }: { agentId: string; agentName: string; inbound: boolean }) {
    const { usage, ownedNumbers, geminiKey } = usePage<UseVoiceAgentEditorPageReturn>();
    const [agents, setAgents] = useState<VoiceAgentOption[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void getVoiceAgentOptions().then((res) => {
            if (res.data) setAgents(res.data.filter((a) => a.id === agentId));
            else setError(res.error ?? 'Could not open the test call');
        });
    }, [agentId]);

    const testCall = error ? (
        <p className="text-destructive text-sm" role="alert">
            {error}
        </p>
    ) : agents ? (
        <TestCallPanel
            numbers={ownedNumbers}
            agents={agents}
            geminiKey={geminiKey}
            numberId={usage.outbound[0]?.id ?? usage.inbound[0]?.id}
        />
    ) : (
        <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
    );

    if (!inbound) {
        return (
            <div className="flex flex-col gap-4">
                <Alert variant="info">
                    <Info className="size-4" />
                    <AlertDescription>
                        {agentName} calls your phone over the phone network. On a Telnyx trial account it only calls your
                        verified number: to try it without that limit, rehearse it in this browser or on Linphone.
                    </AlertDescription>
                </Alert>
                {testCall}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {usage.inbound.length > 0 ? (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Call {agentName} from any phone</h3>
                    {usage.inbound.map((n) => (
                        <div key={n.id} className="rounded-md border px-3 py-2" data-testid="phone-test-number">
                            <PhoneNumberLine number={n} />
                        </div>
                    ))}
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            Calling from another country costs international rates, and some phones and SIM cards cannot call
                            abroad. In this browser or on Linphone it goes over the internet instead, free.
                        </AlertDescription>
                    </Alert>
                </section>
            ) : (
                <p className="text-sm">
                    {agentName} answers no number yet. Pick one under Numbers above, then call it from any phone.
                </p>
            )}
            <section className="flex flex-col gap-2 border-t pt-4">
                <h3 className="text-sm font-medium">Or have {agentName} ring your phone</h3>
                {testCall}
            </section>
        </div>
    );
}
