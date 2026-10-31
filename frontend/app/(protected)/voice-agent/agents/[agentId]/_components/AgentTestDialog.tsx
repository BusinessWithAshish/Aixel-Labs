'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VoiceAgentCallType, type VoiceAgentChannel } from '@aixellabs/backend/db/types';
import { servesPhone, servesWhatsApp } from '@/helpers/voice-agent-channels';
import { getSoftphoneView, type SoftphoneView } from '@/app/actions/voice-softphone-actions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { BrowserTestPanel } from './BrowserTestPanel';
import { PhoneTestPanel } from './PhoneTestPanel';
import { SoftphoneTestPanel } from './SoftphoneTestPanel';
import { WhatsAppTestPanel } from './WhatsAppTestPanel';

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
    /** Phone tests for an agent on a phone line, the WhatsApp chat for one on WhatsApp (from its numbers; null: none yet). */
    channel: VoiceAgentChannel | null;
};

/**
 * The one place to try an agent, as a phone caller would: in this browser (nothing to install, works on any network),
 * on Linphone signed in to the owner's Telnyx account (both over the internet: no country limits, trial-friendly), or
 * on the owner's own phone over the phone network (the test call).
 */
export function AgentTestDialog({ open, onOpenChange, agentId, agentName, callType, channel }: AgentTestDialogProps) {
    const [view, setView] = useState<SoftphoneView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const inbound = callType === VoiceAgentCallType.INBOUND;
    const phone = servesPhone(channel);
    const whatsapp = inbound && servesWhatsApp(channel);
    // The phone tests need the owner's Telnyx softphone view; the WhatsApp chat goes straight to the engine.
    const phoneReady = phone && !!view;

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getSoftphoneView(agentId);
        setLoading(false);
        setError(res.data ? null : (res.error ?? 'Could not load the test'));
        if (res.data) setView(res.data);
    }, [agentId]);

    useEffect(() => {
        if (!open || !phone) return;
        setView(null);
        void load();
    }, [open, phone, load]);

    const asIf = view?.dialIn[0] ? formatPhone(view.dialIn[0].phoneNumber) : 'its number';
    const panelProps = { view: view!, agentId, agentName, inbound, reload: load, loading };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{agentTestTitle(agentName, callType)}</DialogTitle>
                    <DialogDescription>
                        {!phone
                            ? `Chat with ${agentName} the way a customer would on WhatsApp: the same model, tools and settings. Nothing is sent to WhatsApp.`
                            : inbound
                              ? `You call ${agentName} the way a customer would. You’ll hear ${agentName} answer as if you called ${asIf}. In this browser and on Linphone it goes over the internet, so it works from any country.`
                              : `${agentName} calls you and starts the conversation the way it would with a lead. In this browser and on Linphone it goes over the internet, so it works from any country.`}
                    </DialogDescription>
                </DialogHeader>
                {phone && !view ? (
                    error ? (
                        <p className="text-destructive text-sm" role="alert">
                            {error}
                        </p>
                    ) : (
                        <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                    )
                ) : null}
                {phoneReady || whatsapp ? (
                    <Tabs defaultValue={phoneReady ? 'browser' : 'whatsapp'} className="gap-4">
                        <TabsList className="h-auto w-full flex-wrap">
                            {phoneReady ? <TabsTrigger value="browser">In this browser</TabsTrigger> : null}
                            {phoneReady ? <TabsTrigger value="softphone">On Linphone</TabsTrigger> : null}
                            {phoneReady ? <TabsTrigger value="phone">{inbound ? 'From your phone' : 'On your phone'}</TabsTrigger> : null}
                            {whatsapp ? <TabsTrigger value="whatsapp">WhatsApp chat</TabsTrigger> : null}
                        </TabsList>
                        {/* All stay mounted: a call in progress and a password shown once survive a switch. */}
                        {phoneReady ? (
                            <TabsContent value="browser" forceMount className="data-[state=inactive]:hidden">
                                <BrowserTestPanel {...panelProps} />
                            </TabsContent>
                        ) : null}
                        {phoneReady ? (
                            <TabsContent value="softphone" forceMount className="data-[state=inactive]:hidden">
                                <SoftphoneTestPanel {...panelProps} />
                            </TabsContent>
                        ) : null}
                        {phoneReady ? (
                            <TabsContent value="phone" forceMount className="data-[state=inactive]:hidden">
                                <PhoneTestPanel agentId={agentId} agentName={agentName} inbound={inbound} />
                            </TabsContent>
                        ) : null}
                        {whatsapp ? (
                            <TabsContent value="whatsapp" forceMount className="data-[state=inactive]:hidden">
                                <WhatsAppTestPanel agentId={agentId} agentName={agentName} />
                            </TabsContent>
                        ) : null}
                    </Tabs>
                ) : null}
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
