'use client';

import { useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { NUMBER_PROVIDER_ORDER, numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { setupGuideFor, TELNYX_GUIDE_STEP, TWILIO_GUIDE_STEP } from '../_utils/setup-guides';

const FORM_ID = 'connect-number-form';

/** How the customer signs us in to Twilio: an API key (recommended) or the account's Auth Token. */
type TwilioAuthMode = 'apiKey' | 'authToken';

const TWILIO_AUTH_MODES: { value: TwilioAuthMode; label: string }[] = [
    { value: 'apiKey', label: 'API key (recommended)' },
    { value: 'authToken', label: 'Auth Token' },
];

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

function GuideLink({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            className="text-primary text-xs font-medium underline-offset-4 hover:underline"
            onClick={onClick}
        >
            How do I get this?
        </button>
    );
}

function ProviderPicker({
    value,
    disabled,
    onChange,
}: {
    value: VoiceProvider;
    disabled: boolean;
    onChange: (provider: VoiceProvider) => void;
}) {
    return (
        <div role="radiogroup" aria-label="Phone provider" className="grid gap-2 sm:grid-cols-3">
            {NUMBER_PROVIDER_ORDER.map((provider) => {
                const { label, region } = numberProviderInfo(provider);
                const checked = value === provider;
                return (
                    <button
                        key={provider}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={label}
                        disabled={disabled}
                        onClick={() => onChange(provider)}
                        className={cn(
                            'flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors outline-none',
                            'hover:bg-accent/50 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                            'disabled:pointer-events-none disabled:opacity-50',
                            checked ? 'border-primary bg-primary/5 ring-primary ring-1' : 'border-border',
                        )}
                    >
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-muted-foreground text-xs">{region}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function ConnectNumberDialog() {
    const { connectOpen, setConnectOpen, addImported, openSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    const [provider, setProvider] = useState<VoiceProvider>(VoiceProvider.TELNYX);
    const [apiKey, setApiKey] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [clientId, setClientId] = useState('');
    const [twilioAccountSid, setTwilioAccountSid] = useState('');
    const [twilioAuthMode, setTwilioAuthMode] = useState<TwilioAuthMode>('apiKey');
    const [twilioKeySid, setTwilioKeySid] = useState('');
    const [twilioSecret, setTwilioSecret] = useState('');
    const [accountNumbers, setAccountNumbers] = useState<AccountNumber[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const isVoiceLink = provider === VoiceProvider.VOICELINK;
    const isTwilio = provider === VoiceProvider.TWILIO;
    const { label } = numberProviderInfo(provider);
    const words = CREDENTIAL_WORDS[provider];
    const twilioReady =
        !!twilioAccountSid.trim() && !!twilioSecret.trim() && (twilioAuthMode === 'authToken' || !!twilioKeySid.trim());
    const credentialsReady = isTwilio ? twilioReady : isVoiceLink ? !!apiToken.trim() : !!apiKey.trim();
    const hasSetupGuide = !!setupGuideFor(provider);
    const twilioCredentials = (): TwilioCredentials => ({
        accountSid: twilioAccountSid,
        apiKeySid: twilioAuthMode === 'apiKey' ? twilioKeySid : null,
        secret: twilioSecret,
    });

    /** Back to the key / token step, keeping the provider choice. */
    const resetCredentials = () => {
        setApiKey('');
        setApiToken('');
        setClientId('');
        setTwilioAccountSid('');
        setTwilioAuthMode('apiKey');
        setTwilioKeySid('');
        setTwilioSecret('');
        setAccountNumbers(null);
        setSelected(new Set());
        setError(null);
        setBusy(false);
    };

    const onOpenChange = (open: boolean) => {
        setConnectOpen(open);
        if (!open) {
            resetCredentials();
            setProvider(VoiceProvider.TELNYX);
        }
    };

    const chooseProvider = (next: VoiceProvider) => {
        setProvider(next);
        setError(null);
    };

    const findNumbers = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const res = isTwilio
            ? await connectTwilio(twilioCredentials())
            : isVoiceLink
              ? await connectVoiceLink({ apiToken, clientId })
              : await connectTelnyx(apiKey);
        setBusy(false);
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
    };

    const importSelected = async () => {
        setBusy(true);
        setError(null);
        const ids = [...selected];
        const res = isTwilio
            ? await importTwilioNumbers(twilioCredentials(), ids)
            : isVoiceLink
              ? await importVoiceLinkNumbers({ apiToken, clientId }, ids)
              : await importTelnyxNumbers(apiKey, ids);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(res.error ?? 'Could not import the numbers');
            return;
        }
        addImported(res.data);
        toast.success(
            `Imported ${res.data.length} ${res.data.length === 1 ? 'number' : 'numbers'}. Nothing changed in ${label}: calls ring where they did.`,
        );
        onOpenChange(false);
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
        <Dialog open={connectOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Connect a number</DialogTitle>
                    <DialogDescription>
                        {accountNumbers
                            ? `Choose the numbers to add from ${label}. Nothing changes in ${label} until you turn on AI answering or an outbound agent for a number.`
                            : `We use your own ${label} account for calls. Your ${words.secret} ${isTwilio ? 'are' : 'is'} encrypted before ${isTwilio ? 'they are' : 'it is'} stored and never shown again.`}
                    </DialogDescription>
                </DialogHeader>

                {accountNumbers === null ? (
                    <form id={FORM_ID} onSubmit={findNumbers} className="flex min-w-0 flex-col gap-4">
                        <ProviderPicker value={provider} disabled={busy} onChange={chooseProvider} />

                        {isTwilio ? (
                            <>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="twilio-account-sid">Account SID</Label>
                                    <Input
                                        id="twilio-account-sid"
                                        autoComplete="off"
                                        spellCheck={false}
                                        placeholder="AC…"
                                        value={twilioAccountSid}
                                        onChange={(event) => setTwilioAccountSid(event.target.value)}
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        On the Twilio Console home page, under Account Info.
                                    </p>
                                </div>
                                <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-2 gap-2">
                                    {TWILIO_AUTH_MODES.map((mode) => {
                                        const checked = twilioAuthMode === mode.value;
                                        return (
                                            <button
                                                key={mode.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={checked}
                                                disabled={busy}
                                                onClick={() => setTwilioAuthMode(mode.value)}
                                                className={cn(
                                                    'rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none',
                                                    'hover:bg-accent/50 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                                                    'disabled:pointer-events-none disabled:opacity-50',
                                                    checked
                                                        ? 'border-primary bg-primary/5 ring-primary ring-1'
                                                        : 'border-border',
                                                )}
                                            >
                                                {mode.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {twilioAuthMode === 'apiKey' ? (
                                    <>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                                <Label htmlFor="twilio-api-key-sid">API key SID</Label>
                                                {hasSetupGuide ? (
                                                    <GuideLink
                                                        onClick={() => openSetupGuide(provider, TWILIO_GUIDE_STEP.API_KEY)}
                                                    />
                                                ) : null}
                                            </div>
                                            <Input
                                                id="twilio-api-key-sid"
                                                autoComplete="off"
                                                spellCheck={false}
                                                placeholder="SK…"
                                                value={twilioKeySid}
                                                onChange={(event) => setTwilioKeySid(event.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="twilio-secret">API key secret</Label>
                                            <Input
                                                id="twilio-secret"
                                                type="password"
                                                autoComplete="off"
                                                spellCheck={false}
                                                value={twilioSecret}
                                                onChange={(event) => setTwilioSecret(event.target.value)}
                                            />
                                            <p className="text-muted-foreground text-xs">
                                                Twilio Console: Account, API keys &amp; tokens, Create API key (Restricted,
                                                with the permissions in the guide). Twilio shows the secret only once.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                            <Label htmlFor="twilio-secret">Auth Token</Label>
                                            {hasSetupGuide ? (
                                                <GuideLink
                                                    onClick={() => openSetupGuide(provider, TWILIO_GUIDE_STEP.ACCOUNT_SID)}
                                                />
                                            ) : null}
                                        </div>
                                        <Input
                                            id="twilio-secret"
                                            type="password"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={twilioSecret}
                                            onChange={(event) => setTwilioSecret(event.target.value)}
                                        />
                                        <p className="text-muted-foreground text-xs">
                                            Next to the Account SID on the Console home page. An API key is safer: you can
                                            delete it without changing anything else.
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : isVoiceLink ? (
                            <>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="voicelink-api-token">VoiceLink API token</Label>
                                    <Input
                                        id="voicelink-api-token"
                                        type="password"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={apiToken}
                                        onChange={(event) => setApiToken(event.target.value)}
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        In your VoiceLink panel (app.voicelink.co.in), open the API section and create a
                                        token.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="voicelink-client-id">
                                        Client ID{' '}
                                        <span className="text-muted-foreground font-normal">(reseller accounts only)</span>
                                    </Label>
                                    <Input
                                        id="voicelink-client-id"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        placeholder="The client the numbers belong to"
                                        value={clientId}
                                        onChange={(event) => setClientId(event.target.value)}
                                    />
                                </div>
                                <Alert role="note">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        We add a WebSocket bot named &ldquo;Aixel Labs&nbsp;+91&hellip;&rdquo; to your
                                        account when you turn on AI answering or an outbound agent. Keep its &ldquo;WebSocket
                                        API&rdquo; switch off in the VoiceLink panel (WebSocket Bots): with it on, calls are
                                        answered and dropped at once, and the API cannot set it for us.
                                    </AlertDescription>
                                </Alert>
                            </>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                    <Label htmlFor="telnyx-api-key">Telnyx API key</Label>
                                    {hasSetupGuide ? (
                                        <GuideLink onClick={() => openSetupGuide(provider, TELNYX_GUIDE_STEP.API_KEY)} />
                                    ) : null}
                                </div>
                                <Input
                                    id="telnyx-api-key"
                                    type="password"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="KEY0…"
                                    value={apiKey}
                                    onChange={(event) => setApiKey(event.target.value)}
                                />
                                <p className="text-muted-foreground text-xs">
                                    In the Telnyx portal: click your initials at the top right, then API keys.
                                </p>
                            </div>
                        )}
                    </form>
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
                        <Button type="submit" form={FORM_ID} disabled={busy || !credentialsReady}>
                            {busy ? 'Checking…' : 'Find my numbers'}
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" disabled={busy} onClick={resetCredentials}>
                                {words.another}
                            </Button>
                            <Button type="button" disabled={busy || selected.size === 0} onClick={importSelected}>
                                {busy
                                    ? 'Importing…'
                                    : `Import ${selected.size} ${selected.size === 1 ? 'number' : 'numbers'}`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
