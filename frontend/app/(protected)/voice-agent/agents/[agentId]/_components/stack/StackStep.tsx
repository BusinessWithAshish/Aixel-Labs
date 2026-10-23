'use client';

import Link from 'next/link';
import { useFormContext } from 'react-hook-form';
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
import type { ListSort } from '@/components/common/voice-agent/SortToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { stackModel, VOICE_KEY_PROVIDERS, VOICE_STACK_PART_LABELS } from '@/helpers/voice-stack';
import type { VoiceAgentInput } from '@/helpers/voice-schemas';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

/** A Select item cannot have the empty value: this one means "the provider's default key". */
const DEFAULT_KEY = 'default';

type StackStepProps = {
    part: VoiceStackPartName;
    /** Its number in a three-step stack. */
    step?: number;
    stack: VoiceStack<string>;
    sort: ListSort;
};

/** One box of the stack: the model (with its price a minute), the key it runs on and, where it speaks, its voice. */
export function StackStep({ part, step, stack, sort }: StackStepProps) {
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
        // A new voice provider: its first voice, until another is picked.
        const ttsVoice = form.getValues('ttsVoice');
        const first = voices[m.provider]?.[0];
        if (part === 'tts' && m.provider !== VoiceKeyProvider.GEMINI && ttsVoice?.provider !== m.provider && first) {
            form.setValue(
                'ttsVoice',
                { provider: first.provider, voiceId: first.voiceId, name: first.name },
                { shouldDirty: true },
            );
        }
    };

    const modelOptions = [
        ...(listed ? [] : [{ value: current.model, label: `${current.model} · not offered any more`, disabled: true }]),
        ...models.map((m) => ({
            value: m.model,
            label: `${m.name} · ${perMin(m.usdPerMinute)}${m.soon ? ' · coming soon' : ''}`,
            disabled: m.soon,
        })),
    ];
    const keyOptions = keys.length
        ? [
              { value: DEFAULT_KEY, label: `Default (${keys[0].label})`, disabled: freeKey(keys[0].tier) },
              ...keys.map((k) => ({
                  value: k._id,
                  label: `${k.label} · ending ${k.last4}${k.tier === 'free' ? ' · free tier' : ''}`,
                  disabled: freeKey(k.tier),
              })),
          ]
        : [];
    const speaks = part === 'realtime' || part === 'tts';

    return (
        <div className="bg-muted/40 grid min-w-0 content-start gap-3 rounded-lg border p-3" data-testid={id}>
            <div className="flex items-start gap-2">
                {step ? (
                    <span className="bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full text-xs font-medium">
                        {step}
                    </span>
                ) : null}
                <div className="grid gap-0.5">
                    <p className="text-sm leading-5 font-medium">{label.title}</p>
                    <p className="text-muted-foreground text-xs">{label.description}</p>
                </div>
            </div>
            <ZodSelectField
                name={`${id}-model`}
                id={`${id}-model`}
                label="Model"
                value={current.model}
                onChange={pickModel}
                options={modelOptions}
            />
            {keys.length ? (
                <ZodSelectField
                    name={`${id}-key`}
                    id={`${id}-key`}
                    label={`${providerName} key`}
                    value={current.keyId ?? DEFAULT_KEY}
                    onChange={(v) => setPart({ ...current, keyId: v === DEFAULT_KEY ? null : v })}
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
                    <VoicePicker id={`${id}-voice`} provider={current.provider} voices={voices[current.provider] ?? []} />
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
