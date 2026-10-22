'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { VoiceKeyStatus, type VoiceGeminiKeyTier, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { GEMINI_KEY_ANCHOR } from '@/helpers/voice-routes';
import type { UseVoiceSettingsPageReturn } from '../_hooks/use-voice-settings-page';

const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey';

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

function statusBadge(view: VoiceGeminiKeyView) {
    if (!view.set || !view.status) return { label: 'Not set', variant: 'red' as const };
    return STATUS_BADGE[view.status];
}

/** The owner's own Gemini API key, which every call of their agents runs on. */
export function GeminiKeySection() {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const { view } = page;
    const badge = statusBadge(view);
    const problem = view.set && view.status !== VoiceKeyStatus.OK;

    return (
        <SettingsSection
            id={GEMINI_KEY_ANCHOR}
            titleId="gemini-key-title"
            icon={KeyRound}
            title={
                <>
                    Gemini API key
                    <Badge variant={badge.variant} data-testid="gemini-key-status">
                        {badge.label}
                    </Badge>
                </>
            }
            description={
                view.set
                    ? 'Every call runs on your key and is billed to your Google account.'
                    : 'Your agents cannot take or make calls until you add your own key.'
            }
            className="scroll-mt-4"
            data-testid="gemini-key-card"
        >
            {view.set ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-testid="gemini-key-summary">
                    <span>
                        Key ending in <span className="font-mono font-medium">{view.last4}</span>
                    </span>
                    {view.checkedAt ? (
                        <span className="text-muted-foreground" suppressHydrationWarning>
                            checked {formatDistanceToNow(new Date(view.checkedAt), { addSuffix: true })}
                        </span>
                    ) : null}
                    <Select
                        value={view.tier ?? 'paid'}
                        onValueChange={(value) => void page.changeTier(value as VoiceGeminiKeyTier)}
                        disabled={page.savingTier}
                    >
                        <SelectTrigger size="sm" className="w-28" aria-label="Google tier" data-testid="gemini-key-tier">
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
                    {page.savingTier ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden /> : null}
                </div>
            ) : null}
            {view.set && view.tier === 'free' ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                    On the free tier Google may learn from your calls, and low limits can cut calls short.
                </p>
            ) : null}
            {problem && view.statusMessage ? (
                <Alert variant="destructive">
                    <AlertDescription>Google refused this key: {view.statusMessage}</AlertDescription>
                </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={page.openEdit} variant={view.set ? 'outline' : 'default'}>
                    <KeyRound className="size-4" aria-hidden />
                    {view.set ? 'Replace key' : 'Add key'}
                </Button>
                {view.set ? (
                    <>
                        <Button type="button" size="sm" variant="outline" onClick={page.checkNow} disabled={page.checking}>
                            {page.checking ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                                <RefreshCw className="size-4" aria-hidden />
                            )}
                            Check now
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => page.setRemoveOpen(true)}
                        >
                            <Trash2 className="size-4" aria-hidden />
                            Remove
                        </Button>
                    </>
                ) : null}
            </div>
            <GeminiKeyDialog />
            <ConfirmDialog
                open={page.removeOpen}
                onOpenChange={(open) => !open && !page.removing && page.setRemoveOpen(false)}
                title="Remove your Gemini API key?"
                alertMessage="Your agents stop taking and making calls until you add a key again. Your numbers and agents stay set up."
                confirmText="Remove key"
                onConfirm={() => void page.remove()}
                isLoading={page.removing}
            />
        </SettingsSection>
    );
}

function GeminiKeyDialog() {
    const page = usePage<UseVoiceSettingsPageReturn>();
    return (
        <Dialog open={page.editOpen} onOpenChange={page.onEditOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <FormProvider {...page.keyForm}>
                    <form onSubmit={page.save} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>
                                {page.view.set ? 'Replace your Gemini API key' : 'Add your Gemini API key'}
                            </DialogTitle>
                            <DialogDescription>
                                Get one free at{' '}
                                <a
                                    href={AI_STUDIO_KEYS_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                                >
                                    aistudio.google.com/apikey
                                    <ExternalLink className="size-3" aria-hidden />
                                </a>{' '}
                                (&ldquo;Create API key&rdquo;), then paste it here.
                            </DialogDescription>
                        </DialogHeader>
                        <StringControlledField
                            name="apiKey"
                            id="gemini-api-key"
                            label="API key"
                            type="password"
                            placeholder="AIza…"
                            description="We check it with Google, then store it encrypted. Only its last 4 characters are shown."
                            classNames={{ description: 'text-xs' }}
                            inputProps={{ autoComplete: 'off', spellCheck: false, autoFocus: true }}
                        />
                        <Controller
                            control={page.keyForm.control}
                            name="tier"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel id="gemini-key-tier-label">
                                        Google tier (AI Studio shows it next to the key)
                                    </FieldLabel>
                                    <RadioCards
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={TIER_OPTIONS}
                                        aria-labelledby="gemini-key-tier-label"
                                        disabled={page.saving}
                                    />
                                </Field>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => page.onEditOpenChange(false)}
                                disabled={page.saving}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={page.saving}>
                                {page.saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                                {page.saving ? 'Checking with Google…' : 'Check and save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
