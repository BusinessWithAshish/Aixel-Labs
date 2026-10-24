'use client';

import Link from 'next/link';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubModuleUrls } from '@/config/app-config';
import { agentSipAddress, formatDuration } from '@/helpers/voice-call-format';
import { useBrowserTestCall, type BrowserTestPhase } from '../_hooks/use-browser-test-call';
import type { AgentTestPanelProps } from './AgentTestDialog';

const numberSchema = z.object({ numberId: z.string().min(1, 'Choose a number') });

const PHASE_TEXT: Record<Exclude<BrowserTestPhase, 'idle' | 'active'>, string> = {
    mic: 'Allow the microphone…',
    starting: 'Connecting…',
    waiting: 'Waiting for the call…',
    ringing: 'Ringing…',
};

/** Where the agent page sends people without a Telnyx number. */
export function NoTelnyxNumber() {
    return (
        <p className="text-sm">
            Testing over the internet goes through your Telnyx account, and you have no Telnyx number here yet.{' '}
            <Link
                className="text-primary underline-offset-4 hover:underline"
                href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}
            >
                Connect one
            </Link>
            . (Twilio and VoiceLink numbers cannot do this yet.)
        </p>
    );
}

/** In this browser: WebRTC over port 443, so it works on networks that block internet calling. Nothing to install. */
export function BrowserTestPanel({ view, agentId, agentName, inbound }: AgentTestPanelProps) {
    const test = useBrowserTestCall(agentId);
    const numbers = inbound ? view.dialIn : view.callFrom;
    const form = useForm({ resolver: zodResolver(numberSchema), values: { numberId: numbers[0]?.id ?? '' } });

    if (view.telnyxNumbers.length === 0) return <NoTelnyxNumber />;
    if (inbound && view.dialIn.length === 0) {
        return (
            <p className="text-sm">
                {agentName} answers no Telnyx number yet. Pick one under Numbers above, then call it from here.
            </p>
        );
    }

    const start = form.handleSubmit(({ numberId }) => {
        const dialIn = view.dialIn.find((n) => n.id === numberId);
        if (inbound && dialIn) void test.callAgent(numberId, agentSipAddress(dialIn.user, dialIn.host, 'browser'));
        else void test.callMe(numberId);
    });

    if (test.phase !== 'idle') {
        return (
            <div className="flex flex-col items-center gap-4 py-2" data-testid="browser-test-call">
                <p className="text-sm font-medium" role="status">
                    {test.incoming
                        ? `${agentName} is calling…`
                        : test.phase === 'active'
                          ? `On the call with ${agentName} · ${formatDuration(test.seconds)}`
                          : PHASE_TEXT[test.phase]}
                </p>
                <div className="flex gap-3">
                    {test.incoming ? (
                        <>
                            <Button
                                type="button"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={test.incoming.answer}
                            >
                                <Phone className="size-4" />
                                Answer
                            </Button>
                            <Button type="button" variant="destructive" onClick={test.incoming.decline}>
                                <PhoneOff className="size-4" />
                                Decline
                            </Button>
                        </>
                    ) : (
                        <>
                            {test.phase === 'active' ? (
                                <Button type="button" variant="outline" aria-pressed={test.muted} onClick={test.toggleMute}>
                                    {test.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                                    {test.muted ? 'Unmute' : 'Mute'}
                                </Button>
                            ) : null}
                            <Button type="button" variant="destructive" onClick={test.hangup}>
                                <PhoneOff className="size-4" />
                                Hang up
                            </Button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={start} className="flex flex-col gap-3" noValidate>
                {numbers.length > 1 ? (
                    <PhoneNumberControlledField
                        name="numberId"
                        id="browser-test-number"
                        label={inbound ? 'Call it on' : 'Calls you from'}
                        numbers={numbers.map((n) => ({ ...n, provider: VoiceProvider.TELNYX }))}
                    />
                ) : null}
                <p className="text-muted-foreground text-sm">
                    Uses your microphone and speakers, with nothing to install. It works on any network, including mobile
                    hotspots that block internet calling.
                </p>
                {inbound ? null : (
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            Telnyx lets an agent call this browser once your account is upgraded: a trial account only calls
                            its verified number.
                        </AlertDescription>
                    </Alert>
                )}
                {test.error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {test.error}
                    </p>
                ) : null}
                <Button type="submit" className="self-start">
                    <Phone className="size-4" />
                    {inbound ? `Call ${agentName}` : 'Call me here'}
                </Button>
            </form>
        </FormProvider>
    );
}
