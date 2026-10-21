'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { VoiceGeminiKeyStatus, type VoiceGeminiKeyTier, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { GEMINI_KEY_ANCHOR } from '@/helpers/voice-routes';
import { useGeminiKeyCard, type UseGeminiKeyCardReturn } from '../_hooks/use-gemini-key-card';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';

const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey';

/** Google does not say which tier a key is on, so the owner tells us. */
const TIER_OPTIONS: RadioCardOption<VoiceGeminiKeyTier>[] = [
    {
        value: 'paid',
        title: 'Paid tier',
        description:
            'Billing is on for the key’s project. Google charges you per call, its limits are high, and it does not use your calls to improve its products.',
    },
    {
        value: 'free',
        title: 'Free tier',
        description:
            'No billing. Calls cost you nothing, but Google may use what is said on your calls to improve its products, and its low limits can cut calls short.',
    },
];

const STATUS_BADGE: Record<VoiceGeminiKeyStatus, { label: string; variant: 'green' | 'red' | 'yellow' }> = {
    [VoiceGeminiKeyStatus.OK]: { label: 'Working', variant: 'green' },
    [VoiceGeminiKeyStatus.INVALID]: { label: 'Not valid', variant: 'red' },
    [VoiceGeminiKeyStatus.API_DISABLED]: { label: 'API turned off', variant: 'red' },
    [VoiceGeminiKeyStatus.QUOTA]: { label: 'Out of quota', variant: 'yellow' },
};

function statusBadge(view: VoiceGeminiKeyView) {
    if (!view.set || !view.status) return { label: 'Not set', variant: 'red' as const };
    return STATUS_BADGE[view.status];
}

/** The owner's own Gemini API key, which every call of their agents runs on. */
export function GeminiKeyCard({ className }: { className?: string }) {
    const { geminiKey, setGeminiKey } = usePage<UseVoiceAgentsPageReturn>();
    const card = useGeminiKeyCard(geminiKey, setGeminiKey);
    const { view } = card;
    const badge = statusBadge(view);
    const problem = view.set && view.status !== VoiceGeminiKeyStatus.OK;

    return (
        <Card id={GEMINI_KEY_ANCHOR} className={cn('h-auto scroll-mt-4 gap-4', className)} data-testid="gemini-key-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <KeyRound className="text-primary size-4" aria-hidden />
                    Gemini API key
                </CardTitle>
                <CardDescription>
                    Your agents talk through Google&rsquo;s Gemini on your own API key, so every call (phone or playground)
                    is billed to your Google account.
                    {view.set ? null : ' Until you add one, your agents cannot take or place calls.'}
                </CardDescription>
                <CardAction>
                    <Badge variant={badge.variant} data-testid="gemini-key-status">
                        {badge.label}
                    </Badge>
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {view.set ? (
                    <div className="grid gap-1">
                        <p className="text-sm" data-testid="gemini-key-summary">
                            Key ending in <span className="font-mono font-medium">{view.last4}</span>
                            {view.checkedAt ? (
                                <span className="text-muted-foreground" suppressHydrationWarning>
                                    {' '}
                                    · checked {formatDistanceToNow(new Date(view.checkedAt), { addSuffix: true })}
                                </span>
                            ) : null}
                        </p>
                        <p className="text-muted-foreground text-xs">
                            We ask Google about it again every 10 minutes while this page is open. Asking is free: it does
                            not use your Gemini quota.
                        </p>
                    </div>
                ) : null}
                {view.set ? <TierField card={card} /> : null}
                {problem && view.statusMessage ? (
                    <Alert variant="destructive">
                        <AlertDescription>Google refused this key: {view.statusMessage}</AlertDescription>
                    </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={card.openEdit} variant={view.set ? 'outline' : 'default'}>
                        <KeyRound className="size-4" aria-hidden />
                        {view.set ? 'Replace key' : 'Add key'}
                    </Button>
                    {view.set ? (
                        <Button type="button" variant="outline" onClick={card.checkNow} disabled={card.checking}>
                            {card.checking ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                                <RefreshCw className="size-4" aria-hidden />
                            )}
                            Check now
                        </Button>
                    ) : null}
                    {view.set ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => card.setRemoveOpen(true)}
                        >
                            <Trash2 className="size-4" aria-hidden />
                            Remove
                        </Button>
                    ) : null}
                </div>
            </CardContent>
            <GeminiKeyDialog card={card} />
            <ConfirmDialog
                open={card.removeOpen}
                onOpenChange={(open) => !open && !card.removing && card.setRemoveOpen(false)}
                title="Remove your Gemini API key?"
                alertMessage="Your agents stop answering calls, placing calls and talking in the playground until you add a key again. Your numbers and agents stay set up."
                confirmText="Remove key"
                onConfirm={() => void card.remove()}
                isLoading={card.removing}
            />
        </Card>
    );
}

/** Which Google tier the saved key is on, changed in place. */
function TierField({ card }: { card: UseGeminiKeyCardReturn }) {
    const tier = card.view.tier ?? 'paid';
    return (
        <Field className="gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <FieldLabel htmlFor="gemini-key-tier">Google tier</FieldLabel>
                <Select
                    value={tier}
                    onValueChange={(value) => void card.changeTier(value as VoiceGeminiKeyTier)}
                    disabled={card.savingTier}
                >
                    <SelectTrigger id="gemini-key-tier" size="sm" className="w-32" data-testid="gemini-key-tier">
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
                {card.savingTier ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden /> : null}
            </div>
            <p className="text-muted-foreground text-xs">
                {TIER_OPTIONS.find((option) => option.value === tier)?.description} Google AI Studio shows the tier next to
                the key.
            </p>
        </Field>
    );
}

function GeminiKeyDialog({ card }: { card: UseGeminiKeyCardReturn }) {
    return (
        <Dialog open={card.editOpen} onOpenChange={card.onEditOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <FormProvider {...card.keyForm}>
                    <form onSubmit={card.save} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>
                                {card.view.set ? 'Replace your Gemini API key' : 'Add your Gemini API key'}
                            </DialogTitle>
                            <DialogDescription>
                                Your agents use it for every call. It takes a minute to get one.
                            </DialogDescription>
                        </DialogHeader>
                        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
                            <li>
                                Open{' '}
                                <a
                                    href={AI_STUDIO_KEYS_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                                >
                                    aistudio.google.com/apikey
                                    <ExternalLink className="size-3" aria-hidden />
                                </a>{' '}
                                and sign in with your Google account.
                            </li>
                            <li>Click &ldquo;Create API key&rdquo; and copy the key.</li>
                            <li>Paste it below. We check it with Google before saving it.</li>
                        </ol>
                        <StringControlledField
                            name="apiKey"
                            id="gemini-api-key"
                            label="API key"
                            type="password"
                            placeholder="AIza…"
                            description="Stored encrypted and never shown again. Only its last 4 characters are."
                            classNames={{ description: 'text-xs' }}
                            inputProps={{ autoComplete: 'off', spellCheck: false, autoFocus: true }}
                        />
                        <Controller
                            control={card.keyForm.control}
                            name="tier"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel id="gemini-key-tier-label">Which Google tier is this key on?</FieldLabel>
                                    <RadioCards
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={TIER_OPTIONS}
                                        aria-labelledby="gemini-key-tier-label"
                                        disabled={card.saving}
                                    />
                                </Field>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => card.onEditOpenChange(false)}
                                disabled={card.saving}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={card.saving}>
                                {card.saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                                {card.saving ? 'Checking with Google…' : 'Check and save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
