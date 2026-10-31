'use client';

import { useState } from 'react';
import { MessageCircle, PhoneCall } from 'lucide-react';
import { DisabledReason } from '@/components/wrappers/DisabledReason';
import { Button } from '@/components/ui/button';
import { blockerText } from '@/helpers/voice-call-readiness';
import { servesPhone } from '@/helpers/voice-agent-channels';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import { AgentTestDialog, agentTestTitle } from './AgentTestDialog';

/**
 * The card's one way to try the agent, as its numbers make it: on a phone line, a call (in the browser, on Linphone or on
 * the owner's phone); only on WhatsApp, the test chat; on both, both. On no number yet it is a call that waits for one
 * (the playground below tries it without). Green, like a call.
 */
export function AgentTestButton() {
    const { agentId, saved, channel, phoneBlockers, callBlockers } = usePage<UseVoiceAgentEditorPageReturn>();
    const [open, setOpen] = useState(false);
    // The test chat goes straight to the engine; the phone tests need the agent on a phone line.
    const phone = servesPhone(channel);
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
                    {phone ? agentTestTitle(saved.name, saved.callType) : 'Test on WhatsApp'}
                </Button>
            </DisabledReason>
            <AgentTestDialog
                open={open}
                onOpenChange={setOpen}
                agentId={agentId}
                agentName={saved.name}
                callType={saved.callType}
                channel={channel}
            />
        </>
    );
}
