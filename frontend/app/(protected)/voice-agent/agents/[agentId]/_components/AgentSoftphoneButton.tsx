'use client';

import { useState } from 'react';
import { Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import { SoftphoneDialog } from './SoftphoneDialog';

/** Beside Test call: try the agent from a SIP app, for owners who cannot call or be called internationally. */
export function AgentSoftphoneButton() {
    const { agentId, saved } = usePage<UseVoiceAgentEditorPageReturn>();
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Headset className="size-4" />
                Softphone
            </Button>
            <SoftphoneDialog
                open={open}
                onOpenChange={setOpen}
                agentId={agentId}
                agentName={saved.name}
                callType={saved.callType}
            />
        </>
    );
}
