'use client';

import { useState } from 'react';
import { Headset } from 'lucide-react';
import { DisabledReason } from '@/components/wrappers/DisabledReason';
import { Button } from '@/components/ui/button';
import { blockerText } from '@/helpers/voice-call-readiness';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import { AgentTestDialog, agentTestTitle } from './AgentTestDialog';

/** Beside Test call: talk to the agent over the internet, for owners who cannot call or be called internationally. */
export function AgentTestButton() {
    const { agentId, saved, callBlockers } = usePage<UseVoiceAgentEditorPageReturn>();
    const [open, setOpen] = useState(false);
    return (
        <>
            <DisabledReason reason={callBlockers.length ? blockerText(callBlockers) : null}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(true)}
                    disabled={callBlockers.length > 0}
                >
                    <Headset className="size-4" />
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
