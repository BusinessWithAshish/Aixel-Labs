'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { Loader2, Save, Undo2 } from 'lucide-react';
import { VOICE_STACK_MODELS, VoiceStackKind, type VoiceStackPartName } from '@aixellabs/backend/db/types';
import { SelectControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { PIPELINE_PARTS, stackModel, VOICE_KEY_PROVIDERS, VOICE_STACK_PART_LABELS } from '@/helpers/voice-stack';
import { DEFAULT_KEY, type UseVoiceSettingsPageReturn } from '../_hooks/use-voice-settings-page';

/** The stack each agent runs on unless it has its own, with each step's model and key. */
export function VoiceStackCard() {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const currency = useDisplayCurrency();
    const perMin = (usd: number) => `${formatMoney(usd, currency)}/min`;
    const values = page.stackForm.watch();
    const parts: VoiceStackPartName[] = values.kind === VoiceStackKind.REALTIME ? ['realtime'] : [...PIPELINE_PARTS];
    const total = parts.reduce((sum, part) => sum + (stackModel(part, values[part].model)?.usdPerMinute ?? 0), 0);
    const realtimeUsd = stackModel('realtime', values.realtime.model)?.usdPerMinute ?? 0;

    const options: RadioCardOption<VoiceStackKind>[] = [
        {
            value: VoiceStackKind.REALTIME,
            title: 'One voice model',
            description: (
                <>
                    Gemini Live hears the caller and answers out loud. Fastest replies (about 1 second), from{' '}
                    {perMin(realtimeUsd)}, Gemini&rsquo;s 30 voices, understands 90+ languages.
                </>
            ),
        },
        {
            value: VoiceStackKind.PIPELINE,
            title: (
                <>
                    Pick each step <Badge variant="outline">Beta</Badge>
                </>
            ),
            description:
                'Speech to text, then an LLM, then a voice from Cartesia, ElevenLabs or OpenAI. Any voice you like, but a little slower (+0.2 to 0.5 s a reply) and usually about twice the cost.',
        },
    ];

    return (
        <Card className="h-auto" data-testid="voice-stack-card">
            <FormProvider {...page.stackForm}>
                <form onSubmit={page.saveStack} className="contents">
                    <CardHeader>
                        <CardTitle>Voice stack</CardTitle>
                        <CardDescription>
                            What your agents hear, think and speak with. New calls use it; an agent can have its own.
                        </CardDescription>
                        <CardAction className="flex gap-2">
                            {page.stackDirty ? (
                                <Button type="button" size="sm" variant="outline" onClick={page.discardStack}>
                                    <Undo2 className="size-4" aria-hidden />
                                    Discard
                                </Button>
                            ) : null}
                            <Button type="submit" size="sm" disabled={!page.stackDirty || page.savingStack}>
                                {page.savingStack ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                ) : (
                                    <Save className="size-4" aria-hidden />
                                )}
                                Save
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                        <Controller
                            control={page.stackForm.control}
                            name="kind"
                            render={({ field }) => (
                                <RadioCards
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    options={options}
                                    aria-label="Voice stack"
                                />
                            )}
                        />
                        {values.kind === VoiceStackKind.PIPELINE ? (
                            <p className="text-muted-foreground text-xs">
                                Beta: test an agent on this stack in its playground before it takes real calls.
                            </p>
                        ) : null}
                        {parts.map((part) => (
                            <StackPartFields key={part} part={part} perMin={perMin} />
                        ))}
                        {page.missingKeys.length ? (
                            <Alert data-testid="voice-stack-missing-keys">
                                <AlertDescription>
                                    Calls need a key for{' '}
                                    {page.missingKeys.map((p) => VOICE_KEY_PROVIDERS[p].name).join(' and ')}. Add it under
                                    API keys.
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        <p className="text-sm" data-testid="voice-stack-rate">
                            About <span className="font-medium">{perMin(total)}</span> of call at list prices, before your
                            phone provider&rsquo;s minutes.
                        </p>
                    </CardContent>
                </form>
            </FormProvider>
        </Card>
    );
}

function StackPartFields({ part, perMin }: { part: VoiceStackPartName; perMin: (usd: number) => string }) {
    const page = usePage<UseVoiceSettingsPageReturn>();
    const model = page.stackForm.watch(`${part}.model`);
    const provider = stackModel(part, model)?.provider;
    const keys = page.keys.filter((key) => key.provider === provider);
    const label = VOICE_STACK_PART_LABELS[part];

    return (
        <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
            <SelectControlledField
                name={`${part}.model`}
                id={`stack-${part}-model`}
                label={label.title}
                description={label.description}
                classNames={{ description: 'text-xs' }}
                options={VOICE_STACK_MODELS[part].map((m) => ({
                    value: m.model,
                    label: `${m.name} · ${perMin(m.usdPerMinute)}`,
                }))}
            />
            <SelectControlledField
                name={`${part}.keyId`}
                id={`stack-${part}-key`}
                label="Key"
                description={provider ? `${VOICE_KEY_PROVIDERS[provider].name} key it runs on.` : undefined}
                classNames={{ description: 'text-xs' }}
                disabled={!keys.length}
                placeholder="No key yet"
                options={[
                    ...(keys.length ? [{ value: DEFAULT_KEY, label: `Default (${keys[0].label})` }] : []),
                    ...keys.map((key) => ({ value: key._id, label: `${key.label} · ending ${key.last4}` })),
                ]}
            />
        </div>
    );
}
