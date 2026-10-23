'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';
import { TriangleAlert } from 'lucide-react';
import {
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceStack,
    type VoiceStackPart,
    type VoiceStackPartName,
} from '@aixellabs/backend/db/types';
import { ZodSelectField } from '@/components/common/zod-form-builder/ZodFieldComponents';
import { VoicePicker } from '@/components/common/voice-agent/VoicePicker';
import { ProviderLogo } from '@/components/common/voice-agent/ProviderLogo';
import { SortButton, type ListSort } from '@/components/common/voice-agent/SortButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import type { VoiceOption } from '@/helpers/voice-catalogue';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { stackModel, VOICE_KEY_PROVIDERS, VOICE_STACK_PART_LABELS } from '@/helpers/voice-stack';
import type { VoiceAgentInput } from '@/helpers/voice-schemas';
import { cn } from '@/lib/utils';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

type StackStepProps = {
    part: VoiceStackPartName;
    className?: string;
    stack: VoiceStack<string>;
};

/** The voices a text-to-speech model speaks in (Deepgram's are each one model's). */
export const voicesOf = (
    voices: Record<VoiceKeyProvider, VoiceOption[]>,
    tts: Pick<VoiceStackPart<string>, 'provider' | 'model'>,
) => (voices[tts.provider] ?? []).filter((v) => !v.model || v.model === tts.model);

/** A voice step on a new provider or model: its first voice, until another is picked (Gemini's speaks in `voice`). */
export function fitTtsVoice(
    form: UseFormReturn<VoiceAgentInput>,
    voices: Record<VoiceKeyProvider, VoiceOption[]>,
    tts: Pick<VoiceStackPart<string>, 'provider' | 'model'>,
) {
    const list = voicesOf(voices, tts);
    const picked = form.getValues('ttsVoice');
    if (tts.provider === VoiceKeyProvider.GEMINI || !list.length) return;
    if (picked?.provider === tts.provider && list.some((v) => v.voiceId === picked.voiceId)) return;
    const [first] = list;
    form.setValue('ttsVoice', { provider: first.provider, voiceId: first.voiceId, name: first.name }, { shouldDirty: true });
}

/** One box of the stack: the model (with its price a minute), the key it runs on and, where it speaks, its voice. */
export function StackStep({ part, stack, className }: StackStepProps) {
    const [sort, setSort] = useState<ListSort>('price');
    const { stackOptions } = usePage<UseVoiceAgentEditorPageReturn>();
    const { catalogue, keys: allKeys, voices } = stackOptions;
    const form = useFormContext<VoiceAgentInput>();
    const currency = useDisplayCurrency();
    const perMin = (usd: number) => `${formatMoney(usd, currency)}/min`;

    const current: VoiceStackPart<string> = stack.kind === VoiceStackKind.REALTIME ? stack : stack[part as 'stt'];
    const model = stackModel(part, current.model, catalogue);
    const listed = catalogue[part].some((m) => m.model === current.model);
    const models = sort === 'name' ? [...catalogue[part]].sort((a, b) => a.name.localeCompare(b.name)) : catalogue[part];
    const keys = allKeys.filter((k) => k.provider === current.provider);
    const providerName = VOICE_KEY_PROVIDERS[current.provider].name;
    const freeKey = (tier?: string) => !!model?.paidKeyOnly && tier === 'free';
    const logo = (provider: VoiceKeyProvider) => <ProviderLogo provider={provider} className="size-4" />;
    const label = VOICE_STACK_PART_LABELS[part];
    const id = `stack-${part}`;

    const setPart = (next: VoiceStackPart<string>) =>
        form.setValue(
            'stack',
            stack.kind === VoiceStackKind.REALTIME ? { ...next, kind: VoiceStackKind.REALTIME } : { ...stack, [part]: next },
            { shouldDirty: true, shouldValidate: true },
        );

    const pickModel = (value: string) => {
        const m = catalogue[part].find((x) => x.model === value);
        if (!m) return;
        setPart({ provider: m.provider, model: m.model, keyId: m.provider === current.provider ? current.keyId : null });
        if (part === 'tts') fitTtsVoice(form, voices, m);
    };

    const modelOptions = [
        ...(listed ? [] : [{ value: current.model, label: `${current.model} · not offered any more`, disabled: true }]),
        ...models.map((m) => ({
            value: m.model,
            label: `${m.name} · ${perMin(m.usdPerMinute)}${m.soon ? ' · coming soon' : ''}`,
            icon: logo(m.provider),
            disabled: m.soon,
        })),
    ];
    const keyOptions = keys.map((k) => ({
        value: k._id,
        label: `${k.label} · ending ${k.last4}`,
        icon: logo(k.provider),
        disabled: freeKey(k.tier),
    }));
    const speaks = part === 'realtime' || part === 'tts';

    return (
        <div className={cn('grid min-w-0 content-start gap-3 rounded-lg border p-3', className)} data-testid={id}>
            <div className="grid gap-0.5">
                <p className="text-sm leading-5 font-medium">{label.title}</p>
                <p className="text-muted-foreground text-xs">{label.description}</p>
            </div>
            <div className="flex items-end gap-2">
                <ZodSelectField
                    name={`${id}-model`}
                    id={`${id}-model`}
                    label="Model"
                    value={current.model}
                    onChange={pickModel}
                    options={modelOptions}
                    className="min-w-0 flex-1"
                />
                <SortButton value={sort} onChange={setSort} />
            </div>
            {keys.length ? (
                <ZodSelectField
                    name={`${id}-key`}
                    id={`${id}-key`}
                    label={`${providerName} API key`}
                    description={`${keys.length} saved`}
                    classNames={{ description: 'text-xs' }}
                    value={keys.some((k) => k._id === current.keyId) ? current.keyId! : keys[0]._id}
                    onChange={(v) => setPart({ ...current, keyId: v })}
                    options={keyOptions}
                />
            ) : (
                <Alert variant="warning" data-testid={`${id}-no-key`}>
                    <TriangleAlert className="size-4" aria-hidden />
                    <AlertDescription className="text-xs">
                        No {providerName} key yet: this agent cannot take or make calls.{' '}
                        <Link href={GEMINI_KEY_URL} className="font-medium underline underline-offset-4">
                            Add one in Settings
                        </Link>
                    </AlertDescription>
                </Alert>
            )}
            {speaks ? (
                <Field>
                    <FieldLabel htmlFor={`${id}-voice`}>Voice</FieldLabel>
                    <VoicePicker id={`${id}-voice`} provider={current.provider} voices={voicesOf(voices, current)} />
                </Field>
            ) : null}
            {model?.paidKeyOnly ? (
                <Alert variant="warning" data-testid={`${id}-paid-only`}>
                    <TriangleAlert className="size-4" aria-hidden />
                    <AlertDescription className="text-xs">
                        Needs a paid-tier Gemini key: on a free-tier key Google cuts it off after about 4 sentences a minute.
                    </AlertDescription>
                </Alert>
            ) : null}
        </div>
    );
}
