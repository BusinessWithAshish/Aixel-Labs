'use client';

import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VOICE_ANALYSIS_FIELD_TYPES } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { BooleanControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ZodMetaType } from '@/components/common/zod-form-builder/zod-meta-types';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldGroup, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { VOICE_ANALYSIS_FIELD_TYPE_LABELS } from '@/helpers/voice-agent-features';
import { estimateAnalysisCost, formatMoney } from '@/helpers/voice-call-cost';
import type { VoiceAgentCallSettingsInput } from '@/helpers/voice-schemas';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

const LIMITS = VOICE_AGENT_FEATURE_LIMITS;

const TOGGLES = [
    { name: 'analysis.summary', id: 'analysis-summary', label: 'Summary', hint: 'Two or three sentences on what happened.' },
    {
        name: 'analysis.sentiment',
        id: 'analysis-sentiment',
        label: 'Sentiment',
        hint: "Positive, neutral or negative, from the caller's side.",
    },
    {
        name: 'analysis.success',
        id: 'analysis-success',
        label: 'Call successful',
        hint: 'Yes or no, by your own definition. Call logs can filter on it.',
    },
] as const;

/** Field names are written like variables: lowercase, words joined by _. */
const asFieldName = (text: string) => text.toLowerCase().replace(/[\s-]+/g, '_');

function FieldRow({ index, onRemove }: { index: number; onRemove: () => void }) {
    const { control, register, watch } = useFormContext<VoiceAgentCallSettingsInput>();
    const n = index + 1;
    const path = `analysis.fields.${index}` as const;

    return (
        <li className="grid gap-2 px-3 py-3" data-testid="analysis-field">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <Controller
                    control={control}
                    name={`${path}.name`}
                    render={({ field }) => (
                        <Input
                            value={field.value}
                            onChange={(e) => field.onChange(asFieldName(e.target.value))}
                            placeholder="name, like budget"
                            aria-label={`Field ${n} name`}
                            maxLength={44}
                            className="h-8 font-mono text-[13px]"
                        />
                    )}
                />
                <Controller
                    control={control}
                    name={`${path}.type`}
                    render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="h-8 w-full" aria-label={`Field ${n} type`} size="sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VOICE_ANALYSIS_FIELD_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {VOICE_ANALYSIS_FIELD_TYPE_LABELS[type]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 justify-self-end"
                    aria-label={`Remove field ${n}`}
                    onClick={onRemove}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
            <Input
                placeholder="What it means, like: the monthly budget they mentioned, in rupees"
                aria-label={`Field ${n} description`}
                maxLength={LIMITS.analysisDescriptionMax}
                className="h-8"
                {...register(`${path}.description`)}
            />
            {watch(`${path}.type`) === 'choice' ? (
                <Input
                    placeholder="Answers, separated by commas: High, Medium, Low"
                    aria-label={`Field ${n} answers`}
                    className="h-8"
                    {...register(`${path}.options`)}
                />
            ) : null}
        </li>
    );
}

/** What a text model works out from each call's transcript, a few seconds after it ends, and what that costs. */
export function AnalysisSettings() {
    const { control, watch } = useFormContext<VoiceAgentCallSettingsInput>();
    const { geminiKey } = usePage<UseVoiceAgentEditorPageReturn>();
    const currency = useDisplayCurrency();
    const free = geminiKey.tier === 'free';
    const fields = useFieldArray({ control, name: 'analysis.fields' });
    const full = fields.fields.length >= LIMITS.maxAnalysisFields;

    return (
        <SettingsSection
            titleId="analysis-title"
            icon={ClipboardList}
            title="Post-call analysis"
            description="A few seconds after each call, the transcript is read once more and the results show in Call logs. Calls where nobody spoke are skipped."
            className="gap-4"
            data-testid="analysis-settings"
        >
            <p className="text-muted-foreground text-xs" data-testid="analysis-cost">
                {free
                    ? 'Free: it runs on your Gemini key, which is on Google’s free tier.'
                    : `About ${formatMoney(estimateAnalysisCost(false), currency)} a call on your Gemini key. Each call’s real cost shows in Call logs.`}
            </p>
            <FieldGroup className="gap-3">
                {TOGGLES.map((toggle) => (
                    <BooleanControlledField
                        key={toggle.id}
                        name={toggle.name}
                        id={toggle.id}
                        label={toggle.label}
                        description={toggle.hint}
                        classNames={{ description: 'text-xs' }}
                    />
                ))}
                {watch('analysis.success') ? (
                    <StringControlledField
                        name="analysis.successDefinition"
                        id="analysis-success-definition"
                        label="A call is successful when"
                        metadata={ZodMetaType.TEXT_AREA}
                        placeholder="The caller booked an appointment, or agreed to a demo."
                        classNames={{ input: 'min-h-16' }}
                    />
                ) : null}
            </FieldGroup>

            <div className="grid gap-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="grid gap-0.5">
                        <FieldTitle>Custom fields</FieldTitle>
                        <FieldDescription className="text-xs">
                            Values pulled out of every call, like a budget or a yes/no. Up to {LIMITS.maxAnalysisFields}.
                        </FieldDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fields.append({ name: '', type: 'text', description: '', options: '' })}
                        disabled={full}
                    >
                        <Plus className="size-4" />
                        Add field
                    </Button>
                </div>
                {fields.fields.length > 0 ? (
                    <ul className="divide-y rounded-md border" data-testid="analysis-fields">
                        {fields.fields.map((field, index) => (
                            <FieldRow key={field.id} index={index} onRemove={() => fields.remove(index)} />
                        ))}
                    </ul>
                ) : null}
            </div>
        </SettingsSection>
    );
}
