'use client';

import { useState } from 'react';
import { MessageCircle, PhoneCall } from 'lucide-react';
import { DisabledReason } from '@/components/wrappers/DisabledReason';
import { Button } from '@/components/ui/button';
import { blockerText } from '@/helpers/voice-call-readiness';
import { channelOf, servesPhone } from '@/helpers/voice-agent-channels';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import { AgentTestDialog, agentTestTitle } from './AgentTestDialog';

/** The card's one way to try the agent: in the browser, on Linphone or on the owner's phone. Green, like a call. */
export function AgentTestButton() {
    const { agentId, saved, phoneBlockers, callBlockers } = usePage<UseVoiceAgentEditorPageReturn>();
    const [open, setOpen] = useState(false);
    // A WhatsApp-only agent is tried in the test chat, which goes straight to the engine: no number needed.
    const phone = servesPhone(channelOf(saved));
    const blockers = phone ? phoneBlockers : callBlockers;
    const Icon = phone ? PhoneCall : MessageCircle;
    return (
        <>
            <DisabledReason reason={blockers.length ? blockerText(blockers) : null}>
                <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => setOpen(true)}
                    disabled={blockers.length > 0}
                >
                    <Icon className="size-4" />
                    {phone ? agentTestTitle(saved.name, saved.callType) : 'Chat with this agent'}
                </Button>
            </DisabledReason>
            <AgentTestDialog
                open={open}
                onOpenChange={setOpen}
                agentId={agentId}
                agentName={saved.name}
                callType={saved.callType}
                channel={saved.channel}
            />
        </>
    );
}
