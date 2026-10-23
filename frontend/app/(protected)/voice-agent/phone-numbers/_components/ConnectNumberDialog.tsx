'use client';

import { useState } from 'react';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, Info } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import {
    connectTelnyx,
    connectTwilio,
    connectVoiceLink,
    importTelnyxNumbers,
    importTwilioNumbers,
    importVoiceLinkNumbers,
    type AccountNumber,
    type TwilioCredentials,
} from '@/app/actions/voice-number-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

const FORM_ID = 'connect-number-form';

/** How the customer signs us in to Twilio: an API key (recommended) or the account's Auth Token. */
const TWILIO_AUTH_MODES = [
    { value: 'apiKey', title: 'API key (recommended)', description: 'Can be deleted without changing anything else.' },
    { value: 'authToken', title: 'Auth Token', description: 'The account’s own secret.' },
] as const;

/** What the credentials step needs filled in before it can look up numbers (the server checks the rest). */
const credentialsSchema = z
    .object({
        provider: z.nativeEnum(VoiceProvider),
        apiKey: z.string().trim(),
        apiToken: z.string().trim(),
        clientId: z.string().trim(),
        accountSid: z.string().trim(),
        authMode: z.enum(['apiKey', 'authToken']),
        apiKeySid: z.string().trim(),
        secret: z.string().trim(),
    })
    .superRefine((c, ctx) => {
        const missing = (field: keyof typeof c, message: string) =>
            !c[field] && ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] });
        if (c.provider === VoiceProvider.TELNYX) missing('apiKey', 'Paste your Telnyx API key');
        if (c.provider === VoiceProvider.VOICELINK) missing('apiToken', 'Paste your VoiceLink API token');
        if (c.provider === VoiceProvider.TWILIO) {
            missing('accountSid', 'Paste your Twilio Account SID');
            if (c.authMode === 'apiKey') missing('apiKeySid', 'Paste the API key SID');
            missing('secret', c.authMode === 'apiKey' ? 'Paste the API key secret' : 'Paste the Auth Token');
        }
    });

type Credentials = z.infer<typeof credentialsSchema>;

const NO_CREDENTIALS: Credentials = {
    provider: VoiceProvider.TELNYX,
    apiKey: '',
    apiToken: '',
    clientId: '',
    accountSid: '',
    authMode: 'apiKey',
    apiKeySid: '',
    secret: '',
};

function twilioCredentials(c: Credentials): TwilioCredentials {
    return { accountSid: c.accountSid, apiKeySid: c.authMode === 'apiKey' ? c.apiKeySid : null, secret: c.secret };
}

/** Where each provider keeps what the form asks for, and what to call it. */
const CREDENTIAL_WORDS: Record<VoiceProvider, { secret: string; another: string }> = {
    [VoiceProvider.TELNYX]: { secret: 'key', another: 'Use another key' },
    [VoiceProvider.TWILIO]: { secret: 'credentials', another: 'Use other credentials' },
    [VoiceProvider.VOICELINK]: { secret: 'token', another: 'Use another token' },
};

const NO_NUMBERS: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]: 'This Telnyx account has no phone numbers. Buy one in the Telnyx portal, then connect again.',
    [VoiceProvider.TWILIO]:
        'This Twilio account has no phone numbers. Buy one in the Twilio Console (Phone Numbers), then connect again.',
    [VoiceProvider.VOICELINK]:
        'This VoiceLink account has no phone numbers. Ask VoiceLink (or your reseller) to assign one, then connect again.',
};

type CredentialFieldProps = {
    name: keyof Credentials;
    id: string;
    label: React.ReactNode;
    hint?: React.ReactNode;
    secret?: boolean;
} & Pick<React.ComponentProps<'input'>, 'placeholder' | 'inputMode'>;

/** One credential: label, the input, a hint on where to find it. */
function CredentialField({ name, id, label, hint, secret, ...inputProps }: CredentialFieldProps) {
    const { register } = useFormContext<Credentials>();
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                id={id}
                type={secret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                {...inputProps}
                {...register(name)}
            />
            {hint ? <FieldDescription className="text-xs">{hint}</FieldDescription> : null}
        </Field>
    );
}

/** One provider's connect steps: its credentials, then the account's numbers to import. */
function ConnectNumberContent({ provider }: { provider: VoiceProvider }) {
    const { closeConnect, addImported, openSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    const form = useForm({
        resolver: zodResolver(credentialsSchema),
        defaultValues: { ...NO_CREDENTIALS, provider },
        mode: 'onChange',
    });
    const [accountNumbers, setAccountNumbers] = useState<AccountNumber[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const busy = form.formState.isSubmitting || importing;

    const authMode = form.watch('authMode');
    const isVoiceLink = provider === VoiceProvider.VOICELINK;
    const isTwilio = provider === VoiceProvider.TWILIO;
    const { label } = numberProviderInfo(provider);
    const words = CREDENTIAL_WORDS[provider];

    /** Back to the key / token step. */
    const resetCredentials = () => {
        form.reset({ ...NO_CREDENTIALS, provider });
        setAccountNumbers(null);
        setSelected(new Set());
        setError(null);
    };

    const findNumbers = form.handleSubmit(async (c) => {
        setError(null);
        const res =
            c.provider === VoiceProvider.TWILIO
                ? await connectTwilio(twilioCredentials(c))
                : c.provider === VoiceProvider.VOICELINK
                  ? await connectVoiceLink({ apiToken: c.apiToken, clientId: c.clientId })
                  : await connectTelnyx(c.apiKey);
        if (!res.success || !res.data) {
            setError(res.error ?? `Could not reach ${label}`);
            return;
        }
        setAccountNumbers(res.data);
        setSelected(
            new Set(
                res.data
                    .filter((n) => !n.importedByYou && !n.importedElsewhere && !n.cannotImport)
                    .map((n) => n.providerNumberId),
            ),
        );
    });

    const importSelected = async () => {
        const c = form.getValues();
        const ids = [...selected];
        setImporting(true);
        setError(null);
        const res = isTwilio
            ? await importTwilioNumbers(twilioCredentials(c), ids)
            : isVoiceLink
              ? await importVoiceLinkNumbers({ apiToken: c.apiToken, clientId: c.clientId }, ids)
              : await importTelnyxNumbers(c.apiKey, ids);
        setImporting(false);
        if (!res.success || !res.data) {
            setError(res.error ?? 'Could not import the numbers');
            return;
        }
        addImported(res.data);
        toast.success(
            `Imported ${res.data.length} ${res.data.length === 1 ? 'number' : 'numbers'}. Nothing changed in ${label}: calls keep ringing the way they do now.`,
        );
        closeConnect();
    };

    const toggle = (id: string, checked: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <NumberProviderLogo provider={provider} />
                    Connect a {label} number
                </DialogTitle>
                <DialogDescription>
                    {accountNumbers
                        ? `Choose the numbers to add from ${label}. Nothing changes in ${label} until an agent uses a number.`
                        : `We use your own ${label} account for calls. Your ${words.secret} ${isTwilio ? 'are' : 'is'} encrypted before ${isTwilio ? 'they are' : 'it is'} stored and never shown again.`}
                </DialogDescription>
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto w-fit p-0"
                    onClick={() => openSetupGuide(provider, null)}
                >
                    <BookOpen className="size-3.5" aria-hidden />
                    {label} setup guide
                </Button>
            </DialogHeader>

            {accountNumbers === null ? (
                <FormProvider {...form}>
                    <form id={FORM_ID} onSubmit={findNumbers} className="flex min-w-0 flex-col gap-4">
                        {isTwilio ? (
                            <>
                                <CredentialField
                                    name="accountSid"
                                    id="twilio-account-sid"
                                    label="Account SID"
                                    placeholder="AC…"
                                    hint="On the Twilio Console home page, under Account Info."
                                />
                                <Controller
                                    control={form.control}
                                    name="authMode"
                                    render={({ field }) => (
                                        <RadioCards
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            options={TWILIO_AUTH_MODES}
                                            disabled={busy}
                                            aria-label="Sign in with"
                                            className="grid-cols-2"
                                        />
                                    )}
                                />
                                {authMode === 'apiKey' ? (
                                    <>
                                        <CredentialField
                                            name="apiKeySid"
                                            id="twilio-api-key-sid"
                                            label="API key SID"
                                            placeholder="SK…"
                                        />
                                        <CredentialField
                                            name="secret"
                                            id="twilio-secret"
                                            label="API key secret"
                                            secret
                                            hint="Twilio Console: Account, API keys & tokens, Create API key (Restricted, with the permissions in the guide). Twilio shows the secret only once."
                                        />
                                    </>
                                ) : (
                                    <CredentialField
                                        name="secret"
                                        id="twilio-secret"
                                        label="Auth Token"
                                        secret
                                        hint="Next to the Account SID on the Console home page. An API key is safer: you can delete it without changing anything else."
                                    />
                                )}
                            </>
                        ) : isVoiceLink ? (
                            <>
                                <CredentialField
                                    name="apiToken"
                                    id="voicelink-api-token"
                                    label="VoiceLink API token"
                                    secret
                                    hint="In your VoiceLink panel (app.voicelink.co.in), open the API section and create a token."
                                />
                                <CredentialField
                                    name="clientId"
                                    id="voicelink-client-id"
                                    label={
                                        <>
                                            Client ID{' '}
                                            <span className="text-muted-foreground font-normal">
                                                (reseller accounts only)
                                            </span>
                                        </>
                                    }
                                    inputMode="numeric"
                                    placeholder="The client the numbers belong to"
                                />
                                <Alert role="note">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        Once an agent uses a number, keep the &ldquo;WebSocket API&rdquo; switch of our bot
                                        off in VoiceLink (WebSocket Bots). With it on, calls drop at once.
                                    </AlertDescription>
                                </Alert>
                            </>
                        ) : (
                            <CredentialField
                                name="apiKey"
                                id="telnyx-api-key"
                                label="Telnyx API key"
                                secret
                                placeholder="KEY0…"
                                hint="In the Telnyx portal: click your initials at the top right, then API keys."
                            />
                        )}
                    </form>
                </FormProvider>
            ) : accountNumbers.length === 0 ? (
                <p className="text-sm">{NO_NUMBERS[provider]}</p>
            ) : (
                <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
                    {accountNumbers.map((n) => {
                        const unavailable = n.importedByYou || n.importedElsewhere || !!n.cannotImport;
                        const checkboxId = `account-number-${n.providerNumberId}`;
                        return (
                            <li key={n.providerNumberId} className="flex items-center gap-3 px-3 py-2.5">
                                <Checkbox
                                    id={checkboxId}
                                    checked={unavailable ? false : selected.has(n.providerNumberId)}
                                    disabled={unavailable}
                                    onCheckedChange={(checked) => toggle(n.providerNumberId, checked === true)}
                                />
                                <Label
                                    htmlFor={checkboxId}
                                    className="flex flex-1 flex-wrap items-center justify-between gap-2 font-normal"
                                >
                                    <span className="tabular-nums">{n.phoneNumber}</span>
                                    {n.importedByYou ? (
                                        <Badge variant="secondary">Already added</Badge>
                                    ) : n.importedElsewhere ? (
                                        <Badge variant="yellow">Used by another account</Badge>
                                    ) : n.cannotImport ? (
                                        <Badge variant="outline" title={n.cannotImport}>
                                            No voice calls
                                        </Badge>
                                    ) : n.status !== 'active' ? (
                                        <Badge variant="outline">{n.status}</Badge>
                                    ) : null}
                                </Label>
                            </li>
                        );
                    })}
                </ul>
            )}

            {error ? (
                <p className="text-destructive text-sm" role="alert">
                    {error}
                </p>
            ) : null}

            <DialogFooter>
                {accountNumbers === null ? (
                    <Button type="submit" form={FORM_ID} disabled={busy || !form.formState.isValid}>
                        {busy ? 'Checking…' : 'Find my numbers'}
                    </Button>
                ) : (
                    <>
                        <Button type="button" variant="outline" disabled={busy} onClick={resetCredentials}>
                            {words.another}
                        </Button>
                        <Button type="button" disabled={busy || selected.size === 0} onClick={importSelected}>
                            {busy ? 'Importing…' : `Import ${selected.size} ${selected.size === 1 ? 'number' : 'numbers'}`}
                        </Button>
                    </>
                )}
            </DialogFooter>
        </DialogContent>
    );
}

/** Opened from the Connect a number menu, for the provider picked there. */
export function ConnectNumberDialog() {
    const { connect, closeConnect } = usePage<UsePhoneNumbersPageReturn>();
    return (
        <Dialog open={connect.open} onOpenChange={(open) => !open && closeConnect()}>
            <ConnectNumberContent key={connect.opened} provider={connect.provider} />
        </Dialog>
    );
}
