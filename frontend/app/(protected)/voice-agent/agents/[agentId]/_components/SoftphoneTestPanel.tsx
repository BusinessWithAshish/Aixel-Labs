'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, Info, RefreshCw } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import { placeTestCall } from '@/app/actions/voice-number-actions';
import {
    removeSoftphoneLogin,
    resetSoftphonePassword,
    setUpSoftphone,
    type SoftphoneLogin,
} from '@/app/actions/voice-softphone-actions';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { SetupGuideDialog } from '@/components/common/voice-agent/SetupGuideDialog';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SubModuleUrls } from '@/config/app-config';
import { agentSipAddress } from '@/helpers/voice-call-format';
import { LINPHONE_GUIDE } from '../_utils/linphone-guide';
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
        <div className="bg-background flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2">
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

/** Linphone's one-time setup link and its QR code: Linphone fetches the whole account (TLS, proxy, no IPv6/video). */
function SetupLink({ login }: { login: SoftphoneLogin }) {
    return (
        <Alert variant="info" data-testid="linphone-setup">
            <Info className="size-4" />
            <AlertTitle>Set up Linphone in one step</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
                <ol className="ml-4 list-decimal space-y-1">
                    <li>
                        Install <strong>Linphone</strong> (free: iPhone, Android, Mac, Windows, Linux) and open it.
                    </li>
                    <li>
                        On a phone, choose <strong>Scan QR code</strong> and scan this code. On a computer, choose{' '}
                        <strong>Fetch remote configuration</strong> and paste the link.
                    </li>
                    <li>Linphone signs in by itself, over TLS, so it works on networks that block internet calling.</li>
                </ol>
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL, nothing to optimise */}
                    <img
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(login.setupQrSvg)}`}
                        alt="QR code of the Linphone setup link"
                        className="size-40 shrink-0 rounded-md bg-white p-1"
                        data-testid="linphone-qr"
                    />
                    <div className="flex w-full min-w-0 flex-col gap-2">
                        <CopyRow label="Setup link" value={login.setupLink} testId="linphone-setup-link" />
                        <p>
                            <strong>It works once, for 10 minutes.</strong> It carries your password, so do not share it.
                            Need another? Make a new setup link.
                        </p>
                    </div>
                </div>
            </AlertDescription>
        </Alert>
    );
}

/** A SIP app (Linphone) signed in to the owner's own Telnyx account: it dials the agent, or the agent calls it. */
export function SoftphoneTestPanel({ view, agentId, agentName, inbound, reload, loading }: AgentTestPanelProps) {
    const [error, setError] = useState<string | null>(null);
    /** The login right after it was set: the password and setup link are not shown again. */
    const [issued, setIssued] = useState<SoftphoneLogin | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
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
    const guide = <SetupGuideDialog guide={LINPHONE_GUIDE} open={guideOpen} onOpenChange={setGuideOpen} />;

    if (!login) {
        return (
            <FormProvider {...setupForm}>
                <form onSubmit={setUp} className="flex flex-col gap-3" noValidate>
                    <p className="text-sm">
                        Use <strong>Linphone</strong>, a free calling app for your phone or computer. We add a SIP login to
                        your Telnyx account and give you a QR code that sets Linphone up for you. Only your own account can
                        call it, so nobody else reaches your agents through it.
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
                        {setupForm.formState.isSubmitting ? 'Setting up…' : 'Set up Linphone'}
                    </Button>
                </form>
            </FormProvider>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <Section title="1. Sign in on Linphone">
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
                {issued ? (
                    <SetupLink login={issued} />
                ) : (
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            Setting Linphone up on another phone or computer? Make a <strong>new setup link</strong> below.
                            It gives the login a new password, so Linphone signed in elsewhere has to sign in again.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="flex flex-col gap-2">
                    <p className="text-sm">
                        Or by hand: username, {issued ? 'password, ' : ''}domain <strong>sip.telnyx.com</strong>, transport{' '}
                        <strong>TLS</strong>.{' '}
                        <Button type="button" variant="link" className="h-auto p-0" onClick={() => setGuideOpen(true)}>
                            Step-by-step guide
                        </Button>
                    </p>
                    <CopyRow label="Username" value={login.userName} testId="softphone-username" />
                    {issued ? <CopyRow label="Password" value={issued.password} testId="softphone-password" /> : null}
                    <CopyRow label="Outbound proxy and registrar" value="<sip:sip.telnyx.com;transport=tls>" />
                </div>
            </Section>

            {inbound ? (
                <Section title={`2. Call ${agentName}`}>
                    {dialIn.length > 0 ? (
                        <>
                            {dialIn.map((n) => (
                                <CopyRow
                                    key={n.id}
                                    label={`Dial this in Linphone (like calling ${n.phoneNumber})`}
                                    value={agentSipAddress(n.user, n.host, 'softphone', true)}
                                    testId="softphone-dial-in"
                                />
                            ))}
                            <p className="text-sm">
                                Bookings, tools and the call log all work as on a real call. Only Linphone signed in to your
                                Telnyx account can dial it.
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
                            {agentName} is calling Linphone from {calling}. Answer it to talk. The call shows up in{' '}
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
                                    <p className="text-sm">Sign in on Linphone first, then Check again.</p>
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
                    New setup link
                </Button>
            </div>
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title="Remove the softphone?"
                alertMessage="Linphone signed in with it is signed out. You can set it up again later."
                onConfirm={() => void remove()}
                isLoading={busy}
                confirmText="Remove"
            />
            {guide}
        </div>
    );
}
