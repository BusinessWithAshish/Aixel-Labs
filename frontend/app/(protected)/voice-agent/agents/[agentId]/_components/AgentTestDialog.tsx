'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { getSoftphoneView, type SoftphoneView } from '@/app/actions/voice-softphone-actions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { BrowserTestPanel } from './BrowserTestPanel';
import { PhoneTestPanel } from './PhoneTestPanel';
import { SoftphoneTestPanel } from './SoftphoneTestPanel';

/** The dialog's title and button: who calls whom. */
export function agentTestTitle(agentName: string, callType: VoiceAgentCallType): string {
    return callType === VoiceAgentCallType.INBOUND ? 'Call this agent' : `Have ${agentName} call me`;
}

type AgentTestDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    agentName: string;
    callType: VoiceAgentCallType;
};

/**
 * The one place to try an agent, as a phone caller would: in this browser (nothing to install, works on any network),
 * on Linphone signed in to the owner's Telnyx account (both over the internet: no country limits, trial-friendly), or
 * on the owner's own phone over the phone network (the test call).
 */
export function AgentTestDialog({ open, onOpenChange, agentId, agentName, callType }: AgentTestDialogProps) {
    const [view, setView] = useState<SoftphoneView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const inbound = callType === VoiceAgentCallType.INBOUND;

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getSoftphoneView(agentId);
        setLoading(false);
        setError(res.data ? null : (res.error ?? 'Could not load the test'));
        if (res.data) setView(res.data);
    }, [agentId]);

    useEffect(() => {
        if (!open) return;
        setView(null);
        void load();
    }, [open, load]);

    const asIf = view?.dialIn[0] ? formatPhone(view.dialIn[0].phoneNumber) : 'its number';
    const panelProps = { view: view!, agentId, agentName, inbound, reload: load, loading };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{agentTestTitle(agentName, callType)}</DialogTitle>
                    <DialogDescription>
                        {inbound
                            ? `You call ${agentName} the way a customer would. You’ll hear ${agentName} answer as if you called ${asIf}.`
                            : `${agentName} calls you and starts the conversation the way it would with a lead.`}{' '}
                        In this browser and on Linphone it goes over the internet, so it works from any country.
                    </DialogDescription>
                </DialogHeader>
                {view ? (
                    <Tabs defaultValue="browser" className="gap-4">
                        <TabsList className="w-full">
                            <TabsTrigger value="browser">In this browser</TabsTrigger>
                            <TabsTrigger value="softphone">On Linphone</TabsTrigger>
                            <TabsTrigger value="phone">{inbound ? 'From your phone' : 'On your phone'}</TabsTrigger>
                        </TabsList>
                        {/* All stay mounted: a call in progress and a password shown once survive a switch. */}
                        <TabsContent value="browser" forceMount className="data-[state=inactive]:hidden">
                            <BrowserTestPanel {...panelProps} />
                        </TabsContent>
                        <TabsContent value="softphone" forceMount className="data-[state=inactive]:hidden">
                            <SoftphoneTestPanel {...panelProps} />
                        </TabsContent>
                        <TabsContent value="phone" forceMount className="data-[state=inactive]:hidden">
                            <PhoneTestPanel agentId={agentId} agentName={agentName} inbound={inbound} />
                        </TabsContent>
                    </Tabs>
                ) : error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                    </p>
                ) : (
                    <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                )}
            </DialogContent>
        </Dialog>
    );
}

/** What both panels get. */
export type AgentTestPanelProps = {
    view: SoftphoneView;
    agentId: string;
    agentName: string;
    inbound: boolean;
    reload: () => Promise<void>;
    loading: boolean;
};
