'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronDown, Copy, Info, Loader2, RefreshCw } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceAgentCallType, VoiceProvider } from '@aixellabs/backend/db/types';
import { placeTestCall } from '@/app/actions/voice-number-actions';
import {
    getSoftphoneView,
    removeSoftphoneLogin,
    resetSoftphonePassword,
    setUpSoftphone,
    type SoftphoneLogin,
    type SoftphoneView,
} from '@/app/actions/voice-softphone-actions';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SubModuleUrls } from '@/config/app-config';

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

/** Zoiper and Linphone, step by step. */
function SetupSteps({ userName }: { userName: string }) {
    return (
        <Collapsible>
            <CollapsibleTrigger className="text-primary flex items-center gap-1 text-sm underline-offset-4 hover:underline [&[data-state=open]>svg]:rotate-180">
                How to sign in with Zoiper or Linphone
                <ChevronDown className="size-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="text-muted-foreground mt-2 grid gap-3 text-sm">
                <div>
                    <p className="text-foreground font-medium">Zoiper 5 (free: Mac, Windows, iPhone, Android)</p>
                    <ol className="ml-5 list-decimal">
                        <li>Install Zoiper 5 from zoiper.com, the App Store or Google Play, and open it.</li>
                        <li>
                            Add an account. Login: <span className="font-mono">{userName}@sip.telnyx.com</span>, and the
                            password.
                        </li>
                        <li>If it asks for a hostname, enter sip.telnyx.com. Skip the proxy; pick UDP if it asks.</li>
                        <li>
                            Dial with the <span className="font-mono">sip:</span> at the front. Without it Zoiper adds its
                            own domain and the call drops at once.
                        </li>
                    </ol>
                </div>
                <div>
                    <p className="text-foreground font-medium">Linphone (free: Mac, Windows, Linux, iPhone, Android)</p>
                    <ol className="ml-5 list-decimal">
                        <li>Install Linphone from linphone.org or your app store.</li>
                        <li>Choose “Use a SIP account” (not a Linphone account).</li>
                        <li>
                            Username <span className="font-mono">{userName}</span>, the password, domain sip.telnyx.com,
                            transport UDP.
                        </li>
                        <li>Dial the whole SIP address shown below.</li>
                    </ol>
                </div>
                <p>Allow the app to use the microphone. It shows the account as registered once it signed in.</p>
            </CollapsibleContent>
        </Collapsible>
    );
}

type SoftphoneDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    agentName: string;
    callType: VoiceAgentCallType;
};

/**
 * A SIP app on the owner's computer or phone, signed in to their own Telnyx account: they dial the agent, or the
 * agent calls them, over the internet. They hear what a phone caller hears, from any country, on a trial account.
 */
export function SoftphoneDialog({ open, onOpenChange, agentId, agentName, callType }: SoftphoneDialogProps) {
    const [view, setView] = useState<SoftphoneView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    /** The password, right after it was set: it is not shown again. */
    const [issued, setIssued] = useState<SoftphoneLogin | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [calling, setCalling] = useState<string | null>(null);
    const setupForm = useForm({ resolver: zodResolver(numberSchema), defaultValues: { numberId: '' } });
    const callForm = useForm({ resolver: zodResolver(numberSchema), defaultValues: { numberId: '' } });

    const load = useCallback(async () => {
        setChecking(true);
        const res = await getSoftphoneView(agentId);
        setChecking(false);
        if (!res.data) {
            setError(res.error ?? 'Could not open the softphone');
            return;
        }
        setError(null);
        setView(res.data);
        setupForm.reset({ numberId: res.data.telnyxNumbers[0]?.id ?? '' });
        callForm.reset({ numberId: res.data.callFrom[0]?.id ?? '' });
    }, [agentId, setupForm, callForm]);

    useEffect(() => {
        if (!open) return;
        setView(null);
        setIssued(null);
        setCalling(null);
        void load();
    }, [open, load]);

    const afterLogin = async (res: { data?: SoftphoneLogin | null; error?: string | null }) => {
        if (!res.data) {
            setError(res.error ?? 'Telnyx did not take the change');
            return;
        }
        setIssued(res.data);
        await load();
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
        if (!res.success) {
            setError(res.error ?? 'Could not remove the softphone');
            return;
        }
        setIssued(null);
        await load();
    };

    const call = callForm.handleSubmit(async ({ numberId }) => {
        setError(null);
        const res = await placeTestCall(numberId, SOFTPHONE_TARGET, agentId, {});
        if (!res.success) {
            setError(res.error ?? 'Could not start the call');
            return;
        }
        setCalling(view?.callFrom.find((n) => n.id === numberId)?.phoneNumber ?? 'your number');
    });

    const login = view?.login;
    const asOptions = (numbers: SoftphoneView['telnyxNumbers']) =>
        numbers.map((n) => ({ ...n, provider: VoiceProvider.TELNYX }));

    let body: ReactNode;
    if (!view) {
        body = error ? null : <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />;
    } else if (view.telnyxNumbers.length === 0) {
        body = (
            <p className="text-sm">
                The softphone signs in to your Telnyx account, and you have no Telnyx number here yet.{' '}
                <Link
                    className="text-primary underline-offset-4 hover:underline"
                    href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}
                >
                    Connect one
                </Link>
                . (Twilio and VoiceLink numbers do not have a softphone yet.)
            </p>
        );
    } else if (!login) {
        body = (
            <FormProvider {...setupForm}>
                <form id="softphone-setup-form" onSubmit={setUp} className="flex flex-col gap-3" noValidate>
                    <p className="text-sm">
                        We add a SIP login to your Telnyx account. Only your own account can call it, so nobody else reaches
                        your agents through it.
                    </p>
                    {view.telnyxNumbers.length > 1 ? (
                        <PhoneNumberControlledField
                            name="numberId"
                            id="softphone-number"
                            label="Telnyx account of"
                            numbers={asOptions(view.telnyxNumbers)}
                        />
                    ) : null}
                </form>
            </FormProvider>
        );
    } else {
        body = (
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
                        <Button type="button" variant="ghost" size="sm" disabled={checking} onClick={() => void load()}>
                            <RefreshCw className={checking ? 'size-4 animate-spin' : 'size-4'} />
                            Check again
                        </Button>
                    </div>
                    <CopyRow label="Username" value={login.userName} testId="softphone-username" />
                    <CopyRow label="Domain" value={login.domain} />
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
                    <SetupSteps userName={login.userName} />
                </Section>

                {callType === VoiceAgentCallType.INBOUND ? (
                    <Section title={`2. Call ${agentName}`}>
                        {view.dialIn.length > 0 ? (
                            <>
                                {view.dialIn.map((n) => (
                                    <CopyRow
                                        key={n.id}
                                        label={`Dial from the softphone (like calling ${n.phoneNumber})`}
                                        value={n.address}
                                        testId="softphone-dial-in"
                                    />
                                ))}
                                <p className="text-muted-foreground text-xs">
                                    {agentName} answers just as on a call to the number: bookings, tools and the call log all
                                    work. Only softphones signed in to your Telnyx account can dial it.
                                </p>
                            </>
                        ) : (
                            <p className="text-sm">
                                {agentName} answers no Telnyx number in this account yet. Pick one under Numbers above, then
                                come back for the address to dial.
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
                        ) : view.callFrom.length > 0 ? (
                            <FormProvider {...callForm}>
                                <form id="softphone-call-form" onSubmit={call} className="flex flex-col gap-3" noValidate>
                                    {view.callFrom.length > 1 ? (
                                        <PhoneNumberControlledField
                                            name="numberId"
                                            id="softphone-call-from"
                                            label="Calls from"
                                            numbers={asOptions(view.callFrom)}
                                        />
                                    ) : null}
                                    <Alert variant="info">
                                        <Info className="size-4" />
                                        <AlertDescription>
                                            The whole outbound call runs as it would for real, without any phone network.
                                            Telnyx allows it once your account is upgraded: a trial account only calls its
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
            </div>
        );
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Test on a softphone</DialogTitle>
                        <DialogDescription>
                            Hear {agentName} exactly as a phone caller does, from a free SIP app on your computer or phone.
                            It goes over the internet, so it works from any country and on a Telnyx trial account, with no
                            calling charges from the phone network.
                        </DialogDescription>
                    </DialogHeader>
                    {body}
                    {error ? (
                        <p className="text-destructive text-sm" role="alert">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter className="flex-wrap gap-2">
                        {login ? (
                            <>
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
                            </>
                        ) : view && view.telnyxNumbers.length > 0 ? (
                            <Button type="submit" form="softphone-setup-form" disabled={setupForm.formState.isSubmitting}>
                                {setupForm.formState.isSubmitting ? 'Setting up…' : 'Set up softphone'}
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title="Remove the softphone?"
                alertMessage="Softphones signed in with it are signed out, and nobody can call it. You can set it up again later."
                onConfirm={() => void remove()}
                isLoading={busy}
                confirmText="Remove"
            />
        </>
    );
}
