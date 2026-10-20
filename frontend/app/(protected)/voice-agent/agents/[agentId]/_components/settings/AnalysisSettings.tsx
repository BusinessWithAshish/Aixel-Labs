'use client';

import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import type { VoiceAnalysisFieldType } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { VOICE_AGENT_FEATURE_LIMITS, VOICE_ANALYSIS_FIELD_TYPES } from '@/helpers/voice-agent-features';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import type { AnalysisFieldDraft } from '../../_utils/call-settings-draft';

const LIMITS = VOICE_AGENT_FEATURE_LIMITS;

function ToggleRow({
    id,
    label,
    hint,
    checked,
    onChange,
}: {
    id: string;
    label: string;
    hint: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    const { savingSettings } = usePage<UseVoiceAgentEditorPageReturn>();
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p className="text-muted-foreground text-xs">{hint}</p>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={savingSettings} aria-label={label} />
        </div>
    );
}

function FieldRow({ field, index }: { field: AnalysisFieldDraft; index: number }) {
    const { setAnalysisField, removeAnalysisField, savingSettings } = usePage<UseVoiceAgentEditorPageReturn>();
    const n = index + 1;
    return (
        <li className="grid gap-2 px-3 py-3" data-testid="analysis-field">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <Input
                    value={field.name}
                    placeholder="name, like budget"
                    aria-label={`Field ${n} name`}
                    maxLength={44}
                    onChange={(e) =>
                        setAnalysisField(field.key, { name: e.target.value.toLowerCase().replace(/[\s-]+/g, '_') })
                    }
                    disabled={savingSettings}
                    className="h-8 font-mono text-[13px]"
                />
                <Select
                    value={field.type}
                    onValueChange={(type) => setAnalysisField(field.key, { type: type as VoiceAnalysisFieldType })}
                    disabled={savingSettings}
                >
                    <SelectTrigger className="h-8 w-full" aria-label={`Field ${n} type`} size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {VOICE_ANALYSIS_FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                                {t.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 justify-self-end"
                    aria-label={`Remove field ${n}`}
                    onClick={() => removeAnalysisField(field.key)}
                    disabled={savingSettings}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
            <Input
                value={field.description}
                placeholder="What it means, like: the monthly budget they mentioned, in rupees"
                aria-label={`Field ${n} description`}
                maxLength={LIMITS.analysisDescriptionMax}
                onChange={(e) => setAnalysisField(field.key, { description: e.target.value })}
                disabled={savingSettings}
                className="h-8"
            />
            {field.type === 'choice' ? (
                <Input
                    value={field.options}
                    placeholder="Answers, separated by commas: High, Medium, Low"
                    aria-label={`Field ${n} answers`}
                    onChange={(e) => setAnalysisField(field.key, { options: e.target.value })}
                    disabled={savingSettings}
                    className="h-8"
                />
            ) : null}
        </li>
    );
}

/** What a text model works out from each call's transcript, a few seconds after it ends. */
export function AnalysisSettings() {
    const { settingsDraft, setSettings, addAnalysisField, savingSettings } = usePage<UseVoiceAgentEditorPageReturn>();
    const full = settingsDraft.fields.length >= LIMITS.maxAnalysisFields;

    return (
        <section className="grid gap-4" aria-labelledby="analysis-title" data-testid="analysis-settings">
            <div className="grid gap-1">
                <h3 id="analysis-title" className="flex items-center gap-2 font-medium">
                    <ClipboardList className="text-muted-foreground size-4" />
                    Post-call analysis
                </h3>
                <p className="text-muted-foreground text-sm">
                    A few seconds after each call, the transcript is read once more on your Gemini key and the results show
                    in Call logs. Calls where nobody spoke are skipped.
                </p>
            </div>
            <div className="grid gap-3">
                <ToggleRow
                    id="analysis-summary"
                    label="Summary"
                    hint="Two or three sentences on what happened."
                    checked={settingsDraft.summary}
                    onChange={(summary) => setSettings({ summary })}
                />
                <ToggleRow
                    id="analysis-sentiment"
                    label="Sentiment"
                    hint="Positive, neutral or negative, from the caller's side."
                    checked={settingsDraft.sentiment}
                    onChange={(sentiment) => setSettings({ sentiment })}
                />
                <ToggleRow
                    id="analysis-success"
                    label="Call successful"
                    hint="Yes or no, by your own definition. Call logs can filter on it."
                    checked={settingsDraft.success}
                    onChange={(success) => setSettings({ success })}
                />
                {settingsDraft.success ? (
                    <div className="grid gap-2">
                        <Label htmlFor="analysis-success-definition">A call is successful when</Label>
                        <Textarea
                            id="analysis-success-definition"
                            value={settingsDraft.successDefinition}
                            maxLength={LIMITS.successDefinitionMax}
                            placeholder="The caller booked an appointment, or agreed to a demo."
                            onChange={(e) => setSettings({ successDefinition: e.target.value })}
                            disabled={savingSettings}
                            className="min-h-16"
                        />
                    </div>
                ) : null}
            </div>

            <div className="grid gap-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="grid gap-0.5">
                        <p className="text-sm leading-none font-medium">Custom fields</p>
                        <p className="text-muted-foreground text-xs">
                            Values pulled out of every call, like a budget or a yes/no. Up to {LIMITS.maxAnalysisFields}.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addAnalysisField}
                        disabled={full || savingSettings}
                    >
                        <Plus className="size-4" />
                        Add field
                    </Button>
                </div>
                {settingsDraft.fields.length > 0 ? (
                    <ul className="divide-y rounded-md border" data-testid="analysis-fields">
                        {settingsDraft.fields.map((field, index) => (
                            <FieldRow key={field.key} field={field} index={index} />
                        ))}
                    </ul>
                ) : null}
            </div>
        </section>
    );
}
