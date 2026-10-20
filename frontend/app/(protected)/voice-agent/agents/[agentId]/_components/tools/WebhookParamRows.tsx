'use client';

import { Plus, X } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, VOICE_WEBHOOK_PARAM_TYPES, type VoiceWebhookParamType } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICE_WEBHOOK_PARAM_TYPE_LABELS } from '@/helpers/voice-agent-defaults';
import { newParamRow, type ParamDraft } from './webhook-tool-form';

type WebhookParamRowsProps = {
    params: ParamDraft[];
    onChange: (params: ParamDraft[]) => void;
    disabled?: boolean;
};

/** What the agent collects from the caller and sends: name, type, required, and a hint for the agent. */
export function WebhookParamRows({ params, onChange, disabled }: WebhookParamRowsProps) {
    const update = (key: string, patch: Partial<ParamDraft>) =>
        onChange(params.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    const remove = (key: string) => onChange(params.filter((p) => p.key !== key));
    const atLimit = params.length >= VOICE_WEBHOOK_LIMITS.maxParams;

    return (
        <div className="grid gap-2" data-testid="tool-params">
            {params.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No parameters. The agent calls the URL with nothing from the caller.
                </p>
            ) : (
                <ul className="grid gap-2">
                    {params.map((param, index) => {
                        const n = index + 1;
                        const requiredId = `tool-param-${param.key}-required`;
                        return (
                            <li
                                key={param.key}
                                className="bg-muted/30 grid gap-2 rounded-md border p-2"
                                data-testid="tool-param"
                            >
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={param.name}
                                        onChange={(e) => update(param.key, { name: e.target.value })}
                                        placeholder="order_id"
                                        aria-label={`Parameter ${n} name`}
                                        autoComplete="off"
                                        spellCheck={false}
                                        disabled={disabled}
                                        className="h-8 min-w-0 flex-1 font-mono text-base md:text-[13px]"
                                    />
                                    <Select
                                        value={param.type}
                                        onValueChange={(v) => update(param.key, { type: v as VoiceWebhookParamType })}
                                        disabled={disabled}
                                    >
                                        <SelectTrigger size="sm" className="w-28 shrink-0" aria-label={`Parameter ${n} type`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {VOICE_WEBHOOK_PARAM_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {VOICE_WEBHOOK_PARAM_TYPE_LABELS[type]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0"
                                        onClick={() => remove(param.key)}
                                        disabled={disabled}
                                        aria-label={`Remove parameter ${n}`}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Input
                                        value={param.description}
                                        onChange={(e) => update(param.key, { description: e.target.value })}
                                        placeholder="What it means, for the agent"
                                        aria-label={`Parameter ${n} description`}
                                        maxLength={VOICE_WEBHOOK_LIMITS.paramDescriptionMax}
                                        disabled={disabled}
                                        className="h-8 min-w-0 flex-1"
                                    />
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Checkbox
                                            id={requiredId}
                                            checked={param.required}
                                            onCheckedChange={(checked) => update(param.key, { required: checked === true })}
                                            disabled={disabled}
                                            aria-label={`Parameter ${n} required`}
                                        />
                                        <Label htmlFor={requiredId} className="text-xs font-normal">
                                            Required
                                        </Label>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => onChange([...params, newParamRow()])}
                disabled={disabled || atLimit}
            >
                <Plus className="size-4" />
                {atLimit ? `Up to ${VOICE_WEBHOOK_LIMITS.maxParams} parameters` : 'Add parameter'}
            </Button>
        </div>
    );
}
