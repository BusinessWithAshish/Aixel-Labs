'use client';

import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { DisabledReason } from '@/components/wrappers/DisabledReason';
import { Button } from '@/components/ui/button';
import { blockerText } from '@/helpers/voice-call-readiness';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import { AgentTestDialog, agentTestTitle } from './AgentTestDialog';

/** The card's one way to try the agent: in the browser, on Linphone or on the owner's phone. Green, like a call. */
export function AgentTestButton() {
    const { agentId, saved, phoneBlockers } = usePage<UseVoiceAgentEditorPageReturn>();
    const [open, setOpen] = useState(false);
    return (
        <>
            <DisabledReason reason={phoneBlockers.length ? blockerText(phoneBlockers) : null}>
                <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => setOpen(true)}
                    disabled={phoneBlockers.length > 0}
                >
                    <PhoneCall className="size-4" />
                    {agentTestTitle(saved.name, saved.callType)}
                </Button>
            </DisabledReason>
            <AgentTestDialog
                open={open}
                onOpenChange={setOpen}
                agentId={agentId}
                agentName={saved.name}
                callType={saved.callType}
            />
        </>
    );
}
