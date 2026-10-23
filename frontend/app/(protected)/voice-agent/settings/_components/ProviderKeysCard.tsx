'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import {
    VoiceKeyProvider,
    VoiceKeyStatus,
    type VoiceGeminiKeyTier,
    type VoiceProviderKey,
} from '@aixellabs/backend/db/types';
import { SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { ProviderLogo } from '@/components/common/voice-agent/ProviderLogo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { GEMINI_KEY_ANCHOR } from '@/helpers/voice-routes';
import { VOICE_KEY_PROVIDER_ORDER, VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';
import type { UseVoiceSettingsPageReturn } from '../_hooks/use-voice-settings-page';

/** Google does not say which tier a key is on, so the owner tells us. */
const TIER_OPTIONS: RadioCardOption<VoiceGeminiKeyTier>[] = [
    {
        value: 'paid',
        title: 'Paid tier',
        description: 'Billing is on. Google bills you per call, limits are high, and Google does not learn from your calls.',
    },
    {
        value: 'free',
        title: 'Free tier',
        description: 'No billing. Calls are free, but Google may learn from them and low limits can cut calls short.',
    },
];

const STATUS_BADGE: Record<VoiceKeyStatus, { label: string; variant: 'green' | 'red' | 'yellow' }> = {
    [VoiceKeyStatus.OK]: { label: 'Working', variant: 'green' },
    [VoiceKeyStatus.INVALID]: { label: 'Not valid', variant: 'red' },
    [VoiceKeyStatus.API_DISABLED]: { label: 'API turned off', variant: 'red' },
    [VoiceKeyStatus.QUOTA]: { label: 'Out of quota', variant: 'yellow' },
};

/** The owner's own API keys, which their agents' calls run on, grouped by provider. */
export function ProviderKeysCard() {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const providers = VOICE_KEY_PROVIDER_ORDER.filter((p) => page.keys.some((key) => key.provider === p));
    const hasGemini = providers.includes(VoiceKeyProvider.GEMINI);

    return (
        <Card id={GEMINI_KEY_ANCHOR} className="h-auto scroll-mt-4" data-testid="voice-keys-card">
            <CardHeader>
                <CardTitle>API keys</CardTitle>
                <CardDescription>
                    Every call runs on your own keys and is billed to your accounts with each provider. The first key of a
                    provider is its default. Each agent picks its models and which key each runs on, under Agent stack on the
                    agent&rsquo;s page.
                </CardDescription>
                <CardAction>
                    <Button type="button" size="sm" onClick={() => page.openAdd()}>
                        <Plus className="size-4" aria-hidden />
                        Add key
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
                {!hasGemini ? (
                    <Alert variant="warning" data-testid="voice-keys-no-gemini">
                        <KeyRound className="size-4" aria-hidden />
                        <AlertDescription>
                            Your agents cannot take or make calls until you add your own Gemini key.
                        </AlertDescription>
                    </Alert>
                ) : null}
                {providers.map((provider) => (
                    <section key={provider} className="grid gap-2" aria-label={`${VOICE_KEY_PROVIDERS[provider].name} keys`}>
                        <h3 className="flex items-center gap-2 text-sm font-medium">
                            <ProviderLogo provider={provider} className="size-4" />
                            {VOICE_KEY_PROVIDERS[provider].name}
                        </h3>
                        <ItemGroup className="gap-2">
                            {page.keys
                                .filter((key) => key.provider === provider)
                                .map((key, i) => (
                                    <KeyItem key={key._id} keyView={key} isDefault={i === 0} />
                                ))}
                        </ItemGroup>
                    </section>
                ))}
            </CardContent>
            <AddKeyDialog />
            <ConfirmDialog
                open={!!page.removing}
                onOpenChange={(open) => !open && !page.removeBusy && page.setRemoving(null)}
                title={`Remove ${page.removing?.label ?? 'this key'}?`}
                alertMessage="Agents on this key move to the provider's next key. With none left, agents that need it stop taking and making calls until you add one. Your numbers and agents stay set up."
                confirmText="Remove key"
                onConfirm={() => void page.remove()}
                isLoading={page.removeBusy}
            />
        </Card>
    );
}

function KeyItem({ keyView: key, isDefault }: { keyView: VoiceProviderKey; isDefault: boolean }) {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const badge = STATUS_BADGE[key.status];
    const busy = page.busyKeyId === key._id;
    const isGemini = key.provider === VoiceKeyProvider.GEMINI;

    return (
        <Item variant="outline" size="sm" data-testid="voice-key">
            <ItemContent>
                <ItemTitle>
                    {key.label}
                    {isDefault ? <Badge variant="outline">Default</Badge> : null}
                    <Badge variant={badge.variant} data-testid="voice-key-status">
                        {badge.label}
                    </Badge>
                </ItemTitle>
                <ItemDescription suppressHydrationWarning>
                    Ending in <span className="font-mono">{key.last4}</span> · checked{' '}
                    {formatDistanceToNow(new Date(key.checkedAt), { addSuffix: true })}
                </ItemDescription>
                {isGemini && key.tier === 'free' ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                        On the free tier Google may learn from your calls, and low limits can cut calls short.
                    </p>
                ) : null}
                {key.statusMessage ? (
                    <Alert variant="destructive" className="mt-1">
                        <AlertDescription>
                            {VOICE_KEY_PROVIDERS[key.provider].name} refused this key: {key.statusMessage}
                        </AlertDescription>
                    </Alert>
                ) : null}
            </ItemContent>
            <ItemActions className="flex-wrap">
                {isGemini ? (
                    <Select
                        value={key.tier ?? 'paid'}
                        onValueChange={(value) => void page.changeTier(key, value as VoiceGeminiKeyTier)}
                        disabled={busy}
                    >
                        <SelectTrigger size="sm" className="w-28" aria-label={`Google tier of ${key.label}`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : null}
                {!isDefault ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void page.makeDefault(key)}
                        disabled={busy}
                    >
                        <Star className="size-4" aria-hidden />
                        Make default
                    </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" onClick={() => page.checkNow(key._id)} disabled={busy}>
                    {busy ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                        <RefreshCw className="size-4" aria-hidden />
                    )}
                    Check now
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => page.setRemoving(key)}
                    aria-label={`Remove ${key.label}`}
                >
                    <Trash2 className="size-4" aria-hidden />
                </Button>
            </ItemActions>
        </Item>
    );
}

function AddKeyDialog() {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const provider = page.addForm.watch('provider');
    const info = VOICE_KEY_PROVIDERS[provider];

    return (
        <Dialog open={page.addOpen} onOpenChange={page.onAddOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <FormProvider {...page.addForm}>
                    <form onSubmit={page.add} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>Add an API key</DialogTitle>
                            <DialogDescription>
                                Create one at{' '}
                                <a
                                    href={info.keysUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                                >
                                    {info.keysUrlLabel}
                                    <ExternalLink className="size-3" aria-hidden />
                                </a>
                                , then paste it here.
                            </DialogDescription>
                        </DialogHeader>
                        <SelectControlledField
                            name="provider"
                            id="voice-key-provider"
                            label="Provider"
                            options={VOICE_KEY_PROVIDER_ORDER.map((p) => ({
                                value: p,
                                label: VOICE_KEY_PROVIDERS[p].name,
                                icon: <ProviderLogo provider={p} className="size-4" />,
                            }))}
                        />
                        <StringControlledField
                            name="label"
                            id="voice-key-label"
                            label="Name (optional)"
                            placeholder="Clinic project"
                            description="To tell your keys apart when an agent picks one."
                            classNames={{ description: 'text-xs' }}
                        />
                        <StringControlledField
                            name="apiKey"
                            id="voice-key-value"
                            label="API key"
                            type="password"
                            placeholder={info.placeholder}
                            description={`We check it with ${info.name}, then store it encrypted. Only its last 4 characters are shown.`}
                            classNames={{ description: 'text-xs' }}
                            inputProps={{ autoComplete: 'off', spellCheck: false, autoFocus: true }}
                        />
                        {provider === VoiceKeyProvider.GEMINI ? (
                            <Controller
                                control={page.addForm.control}
                                name="tier"
                                render={({ field }) => (
                                    <Field>
                                        <FieldLabel id="voice-key-tier-label">
                                            Google tier (AI Studio shows it next to the key)
                                        </FieldLabel>
                                        <RadioCards
                                            value={field.value ?? 'paid'}
                                            onValueChange={field.onChange}
                                            options={TIER_OPTIONS}
                                            aria-labelledby="voice-key-tier-label"
                                            disabled={page.adding}
                                        />
                                    </Field>
                                )}
                            />
                        ) : null}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => page.onAddOpenChange(false)}
                                disabled={page.adding}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={page.adding}>
                                {page.adding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                                {page.adding ? `Checking with ${info.name}…` : 'Check and save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
