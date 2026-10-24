'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronDown, Copy, Info, RefreshCw } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import { placeTestCall } from '@/app/actions/voice-number-actions';
import {
    removeSoftphoneLogin,
    resetSoftphonePassword,
    setUpSoftphone,
    type SoftphoneLogin,
} from '@/app/actions/voice-softphone-actions';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SubModuleUrls } from '@/config/app-config';
import { agentSipAddress } from '@/helpers/voice-call-format';
import type { AgentTestPanelProps } from './AgentTestDialog';
import { NoTelnyxNumber } from './BrowserTestPanel';

/** What placeTestCall takes as `to` to ring the softphone (SOFTPHONE_TARGET on the server). */
const SOFTPHONE_TARGET = 'softphone';

const numberSchema = z.object({ numberId: z.string().min(1, 'Choose a number') });

async function copy(value: string, what: string) {
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${what} copied`);
    } catch {
        toast.error(`Could not copy the ${what.toLowerCase()}`);
    }
}

function CopyRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-xs">{label}</span>
                <span className="font-mono text-sm break-all" data-testid={testId}>
                    {value}
                </span>
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Copy ${label.toLowerCase()}`}
                onClick={() => void copy(value, label)}
            >
                <Copy className="size-4" />
            </Button>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {children}
        </section>
    );
}

/** Linphone over TLS first: SIP on 5060 is blocked by many mobile networks (Indian carriers included), 5061 is not. */
function SetupSteps({ userName }: { userName: string }) {
    return (
        <Collapsible defaultOpen>
            <CollapsibleTrigger className="text-primary flex items-center gap-1 text-sm underline-offset-4 hover:underline [&[data-state=open]>svg]:rotate-180">
                How to sign in with Linphone
                <ChevronDown className="size-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="text-muted-foreground mt-2 grid gap-3 text-sm">
                <ol className="ml-5 list-decimal">
                    <li>
                        Install Linphone (free: Mac, Windows, Linux, iPhone, Android) from linphone.org or your app store.
                    </li>
                    <li>Choose “Use a SIP account” (a third-party account, not a Linphone one).</li>
                    <li>
                        Username <span className="font-mono">{userName}</span>, the password, domain{' '}
                        <span className="font-mono">sip.telnyx.com</span>, transport <strong>TLS</strong>.
                    </li>
                    <li>Leave media encryption on None, and allow the microphone.</li>
                </ol>
                <p>
                    Why TLS: it signs in on port 5061, which works on networks that block internet calling. Zoiper’s free
                    version has no TLS: use it only on Wi-Fi that does not block port 5060, and dial with{' '}
                    <span className="font-mono">sip:</span> at the front.
                </p>
            </CollapsibleContent>
        </Collapsible>
    );
}

/** A SIP app signed in to the owner's own Telnyx account: it dials the agent, or the agent calls it. */
export function SoftphoneTestPanel({ view, agentId, agentName, inbound, reload, loading }: AgentTestPanelProps) {
    const [error, setError] = useState<string | null>(null);
    /** The password, right after it was set: it is not shown again. */
    const [issued, setIssued] = useState<SoftphoneLogin | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [calling, setCalling] = useState<string | null>(null);
    const login = view.login;
    const dialIn = view.dialIn.filter((n) => n.softphone);
    const callFrom = view.callFrom.filter((n) => n.softphone);
    const setupForm = useForm({
        resolver: zodResolver(numberSchema),
        values: { numberId: view.telnyxNumbers[0]?.id ?? '' },
    });
    const callForm = useForm({ resolver: zodResolver(numberSchema), values: { numberId: callFrom[0]?.id ?? '' } });

    if (view.telnyxNumbers.length === 0) return <NoTelnyxNumber />;

    const afterLogin = async (res: { data?: SoftphoneLogin | null; error?: string | null }) => {
        setError(res.data ? null : (res.error ?? 'Telnyx did not take the change'));
        if (!res.data) return;
        setIssued(res.data);
        await reload();
    };

    const setUp = setupForm.handleSubmit(async ({ numberId }) => afterLogin(await setUpSoftphone(numberId)));

    const reset = async () => {
        setBusy(true);
        await afterLogin(await resetSoftphonePassword());
        setBusy(false);
    };

    const remove = async () => {
        setBusy(true);
        const res = await removeSoftphoneLogin();
        setBusy(false);
        setRemoveOpen(false);
        setError(res.success ? null : (res.error ?? 'Could not remove the softphone'));
        setIssued(null);
        await reload();
    };

    const call = callForm.handleSubmit(async ({ numberId }) => {
        setError(null);
        const res = await placeTestCall(numberId, SOFTPHONE_TARGET, agentId, {});
        if (!res.success) return setError(res.error ?? 'Could not start the call');
        setCalling(callFrom.find((n) => n.id === numberId)?.phoneNumber ?? 'your number');
    });

    const errorLine = error ? (
        <p className="text-destructive text-sm" role="alert">
            {error}
        </p>
    ) : null;

    if (!login) {
        return (
            <FormProvider {...setupForm}>
                <form onSubmit={setUp} className="flex flex-col gap-3" noValidate>
                    <p className="text-sm">
                        A free SIP app (Linphone) on your computer or phone. We add a SIP login to your Telnyx account; only
                        your own account can call it, so nobody else reaches your agents through it.
                    </p>
                    {view.telnyxNumbers.length > 1 ? (
                        <PhoneNumberControlledField
                            name="numberId"
                            id="softphone-number"
                            label="Telnyx account of"
                            numbers={view.telnyxNumbers.map((n) => ({ ...n, provider: VoiceProvider.TELNYX }))}
                        />
                    ) : null}
                    {errorLine}
                    <Button type="submit" className="self-start" disabled={setupForm.formState.isSubmitting}>
                        {setupForm.formState.isSubmitting ? 'Setting up…' : 'Set up softphone'}
                    </Button>
                </form>
            </FormProvider>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <Section title="1. Sign in on your softphone">
                <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="softphone-status">
                    {login.registered === true ? (
                        <Badge className="bg-emerald-600 text-white">Signed in</Badge>
                    ) : login.registered === false ? (
                        <Badge variant="secondary">Not signed in yet</Badge>
                    ) : (
                        <Badge variant="outline">Sign-in status unknown</Badge>
                    )}
                    <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void reload()}>
                        <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
                        Check again
                    </Button>
                </div>
                <CopyRow label="Username" value={login.userName} testId="softphone-username" />
                {issued ? (
                    <>
                        <CopyRow label="Password" value={issued.password} testId="softphone-password" />
                        <Alert variant="warning">
                            <Info className="size-4" />
                            <AlertDescription>
                                Save the password in your softphone now: it is not shown again. Lost it? Reset it.
                            </AlertDescription>
                        </Alert>
                    </>
                ) : (
                    <p className="text-muted-foreground text-xs">
                        The password was shown once, when it was set. Reset it to get a new one.
                    </p>
                )}
                <CopyRow label="Domain" value={login.domain} />
                <CopyRow label="Transport" value="TLS (port 5061)" />
                <SetupSteps userName={login.userName} />
            </Section>

            {inbound ? (
                <Section title={`2. Call ${agentName}`}>
                    {dialIn.length > 0 ? (
                        <>
                            {dialIn.map((n) => (
                                <CopyRow
                                    key={n.id}
                                    label={`Dial from the softphone (like calling ${n.phoneNumber})`}
                                    value={agentSipAddress(n.user, n.host, 'softphone')}
                                    testId="softphone-dial-in"
                                />
                            ))}
                            <p className="text-muted-foreground text-xs">
                                Bookings, tools and the call log all work as on a real call. Only softphones signed in to
                                your Telnyx account can dial it.
                            </p>
                        </>
                    ) : (
                        <p className="text-sm">
                            {agentName} answers no Telnyx number in this account yet. Pick one under Numbers above, then come
                            back for the address to dial.
                        </p>
                    )}
                </Section>
            ) : (
                <Section title={`2. ${agentName} calls you`}>
                    {calling ? (
                        <p className="text-sm" role="status">
                            {agentName} is calling your softphone from {calling}. Answer it to talk. The call shows up in{' '}
                            <Link
                                className="text-primary underline-offset-4 hover:underline"
                                href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS]}
                            >
                                Call logs
                            </Link>{' '}
                            when it ends.
                        </p>
                    ) : callFrom.length > 0 ? (
                        <FormProvider {...callForm}>
                            <form onSubmit={call} className="flex flex-col gap-3" noValidate>
                                {callFrom.length > 1 ? (
                                    <PhoneNumberControlledField
                                        name="numberId"
                                        id="softphone-call-from"
                                        label="Calls from"
                                        numbers={callFrom.map((n) => ({ ...n, provider: VoiceProvider.TELNYX }))}
                                    />
                                ) : null}
                                <Alert variant="info">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        Telnyx allows this call once your account is upgraded: a trial account only calls its
                                        verified number.
                                    </AlertDescription>
                                </Alert>
                                <Button
                                    type="submit"
                                    className="self-start"
                                    disabled={callForm.formState.isSubmitting || login.registered === false}
                                >
                                    {callForm.formState.isSubmitting ? 'Calling…' : 'Call my softphone'}
                                </Button>
                                {login.registered === false ? (
                                    <p className="text-muted-foreground text-xs">
                                        Sign in on your softphone first, then Check again.
                                    </p>
                                ) : null}
                            </form>
                        </FormProvider>
                    ) : (
                        <p className="text-sm">No Telnyx number in this account can place the call yet.</p>
                    )}
                </Section>
            )}

            {errorLine}
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => setRemoveOpen(true)}
                >
                    Remove
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void reset()}>
                    Reset password
                </Button>
            </div>
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title="Remove the softphone?"
                alertMessage="Softphones signed in with it are signed out. You can set it up again later."
                onConfirm={() => void remove()}
                isLoading={busy}
                confirmText="Remove"
            />
        </div>
    );
}
